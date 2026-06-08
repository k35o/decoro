// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. Postgres connection lives here.
// oxlint-disable-next-line import/no-unassigned-import
import 'server-only';
import { eq } from 'drizzle-orm';

import { db, schema } from './db/client.ts';
import {
  SHARE_ID_PATTERN,
  type SnapshotRecord,
  snapshotRecordSchema,
} from './share-types.ts';

/**
 * Postgres-backed share snapshot store (per ADR-015).
 *
 * Snapshots are written immutably — the schema has no UPDATE path and the
 * insert is a plain INSERT (a primary-key collision raises
 * `SnapshotExistsError`, which the route handler retries with a fresh id).
 * Reads validate the row against `snapshotRecordSchema` so a JSONB column
 * tampered with directly in the DB still fails into "looks missing" rather
 * than crashing the share page.
 *
 * Public API mirrors the previous filesystem implementation exactly so
 * route handlers and `share/[id]/page.tsx` need no changes; the migration
 * happens in this module alone.
 */

/**
 * Sentinel error for callers (e.g. `POST /api/share`) to catch and react to
 * an id collision by regenerating the id and retrying. Carries `code: 'EEXIST'`
 * so callers can match Node's filesystem convention without depending on the
 * underlying error class — the convention predates the Postgres swap and is
 * worth keeping for the route's existing retry logic.
 */
export class SnapshotExistsError extends Error {
  readonly code = 'EEXIST' as const;
  constructor(id: string) {
    super(`snapshot already exists: ${id}`);
    this.name = 'SnapshotExistsError';
  }
}

/**
 * Writes the snapshot. Postgres' primary-key constraint enforces the
 * immutability guarantee — a colliding id surfaces as `SnapshotExistsError`
 * and the route regenerates the id rather than overwriting.
 *
 * `parentShareId` defaults to null (originated standalone). When this
 * snapshot was created by forking another, the route passes the parent id
 * so lineage queries become a recursive CTE later.
 */
export const putSnapshot = async (
  record: SnapshotRecord & { parentShareId?: string | null },
): Promise<void> => {
  try {
    await db.insert(schema.shares).values({
      id: record.id,
      createdAt: new Date(record.createdAt),
      schemaVersion: record.schemaVersion,
      messages: record.messages,
      spec: record.spec,
      parentShareId: record.parentShareId ?? null,
    });
  } catch (err) {
    // postgres-js surfaces unique-violation as SQLSTATE '23505'. Drizzle
    // may wrap it in DrizzleQueryError, so check both `err.code` and
    // `err.cause.code`.
    const code =
      typeof err === 'object' && err !== null
        ? ((err as { code?: string }).code ??
          (err as { cause?: { code?: string } }).cause?.code)
        : undefined;
    if (code === '23505') {
      throw new SnapshotExistsError(record.id);
    }
    throw err;
  }
};

/**
 * Returns `null` for missing snapshots. Returns `null` (not throws) for
 * rows that fail re-validation — schema corruption shouldn't 500 the share
 * page, just look like a missing snapshot. Surfaces the parse error to logs
 * for the operator to diagnose.
 */
export const getSnapshot = async (
  id: string,
): Promise<SnapshotRecord | null> => {
  if (!SHARE_ID_PATTERN.test(id)) return null;
  const rows = await db
    .select()
    .from(schema.shares)
    .where(eq(schema.shares.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const parsed = snapshotRecordSchema.safeParse({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    schemaVersion: row.schemaVersion,
    messages: row.messages,
    spec: row.spec,
  });
  if (!parsed.success) {
    console.error(`[share-store] schema mismatch for ${id}:`, parsed.error);
    return null;
  }
  return parsed.data;
};
