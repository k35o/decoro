import { share } from '../../../../decoro.config.ts';
import { SnapshotExistsError, putSnapshot } from '../../../lib/share-store.ts';
import { newShareId, snapshotInputSchema } from '../../../lib/share-types.ts';

const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * Per-IP rate limit. Best-effort only.
 *
 * The trust model (see `/api/generate` and ADR-013) is "self-hosted,
 * trusted-network MVP". `x-forwarded-for` and `x-real-ip` are read raw
 * because, in the intended deployment, only a trusted reverse proxy
 * populates them. In environments where untrusted clients can spoof those
 * headers (no proxy, or a proxy that passes them through verbatim), this
 * limiter is trivial to bypass — treat it as a guardrail against client
 * retry storms, not as adversarial defense. The window resets every 5
 * minutes; the bucket is in-process and lost on cold start, which is fine
 * for the threat model.
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
 * Builds the absolute share origin. Prefers an explicit `share.publicBaseUrl`
 * from `decoro.config.ts`; falls back to forwarded headers (set by most
 * reverse proxies) and finally to `Host`. `req.url` is intentionally not
 * used directly — Next.js may report an internal `http://` origin behind a
 * TLS-terminating proxy, and the URL we hand back to clients has to be one
 * they can actually open from outside the box.
 */
const baseOriginFor = (req: Request): string => {
  if (share.publicBaseUrl !== undefined && share.publicBaseUrl !== '') {
    return share.publicBaseUrl.replace(/\/$/, '');
  }
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    req.headers.get('host');
  if (host === null || host === '') {
    // Last resort. `req.url` at least carries the host the runtime saw.
    return new URL(req.url).origin;
  }
  return `${proto ?? 'http'}://${host}`;
};

const MAX_ID_RETRIES = 5;

/**
 * POST /api/share
 *
 * Body: `{ messages, spec }` (validated against the same per-message /
 * per-element limits as `/api/generate`).
 *
 * Returns: `{ id, url }` where `url` is the absolute share URL built from
 * `share.publicBaseUrl` (or the request's forwarded headers). The store
 * writes exclusively (`flag: 'wx'`) so a colliding id surfaces as
 * `SnapshotExistsError` and we regenerate the id rather than overwrite —
 * the immutability guarantee in ADR-013 is enforced at the FS layer, not
 * just left to ID-collision probability.
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

  const createdAt = new Date().toISOString();
  let id = newShareId();
  for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
    try {
      // Retry must be sequential — each attempt depends on whether the
      // previous write succeeded. `Promise.all` does not apply here.
      // oxlint-disable-next-line eslint(no-await-in-loop)
      await putSnapshot({
        ...parsed.data,
        id,
        createdAt,
        schemaVersion: 1,
      });
      break;
    } catch (err) {
      if (err instanceof SnapshotExistsError && attempt < MAX_ID_RETRIES - 1) {
        id = newShareId();
        continue;
      }
      return jsonError(
        500,
        err instanceof Error ? err.message : 'Failed to write snapshot',
      );
    }
  }

  const url = `${baseOriginFor(req)}/share/${id}`;
  return new Response(JSON.stringify({ id, url }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};
