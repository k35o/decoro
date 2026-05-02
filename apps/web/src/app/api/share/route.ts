import { putSnapshot } from '../../../lib/share-store.ts';
import { newShareId, snapshotInputSchema } from '../../../lib/share-types.ts';

const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Per-IP rate limit. The trust model (see `/api/generate`) is "self-hosted,
 * trusted-network MVP", so this is mostly belt-and-braces against an
 * accidental client retry storm rather than a real adversary. Window resets
 * every 5 minutes; bucket is in-process and lost on cold start, which is
 * fine for the threat model.
 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const buckets = new Map<string, { count: number; expires: number }>();

const ipFromHeaders = (req: Request): string => {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd !== null && fwd !== '') {
    return fwd.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
};

const consumeRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.expires < now) {
    buckets.set(ip, { count: 1, expires: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
};

/**
 * POST /api/share
 *
 * Body: `{ messages, spec }` (validated against the same per-message /
 * per-element limits as `/api/generate`).
 *
 * Returns: `{ id, url }` where `url` is the absolute share URL derived
 * from the request's host header.
 */
export const POST = async (req: Request) => {
  const ip = ipFromHeaders(req);
  if (!consumeRateLimit(ip)) {
    return jsonError(
      429,
      'Share rate limit reached; try again in a few minutes.',
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON');
  }

  const parsed = snapshotInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, parsed.error.message);
  }

  const id = newShareId();
  try {
    await putSnapshot({
      ...parsed.data,
      id,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    });
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to write snapshot',
    );
  }

  const url = new URL(`/share/${id}`, req.url).toString();
  return new Response(JSON.stringify({ id, url }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};
