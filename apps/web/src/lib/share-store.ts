import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  SHARE_ID_PATTERN,
  type SnapshotRecord,
  snapshotRecordSchema,
} from './share-types.ts';

/**
 * Filesystem-backed snapshot store for Tier 2 sharing (see ADR-013).
 *
 * Snapshots live as one JSON file per id under `<repo-root>/.decoro-shares/`
 * (gitignored). The store deliberately has no delete or update method:
 * snapshots are immutable for the lifetime of the deployment, and removing
 * a share means deleting the file by hand. Suits a single-user self-host
 * MVP; revisit when sharing reaches Tier 3+ (auth, multi-user, lifecycle).
 *
 * Storage location is fixed for now. A `decoro.config.ts` extension point
 * (filesystem | vercel-kv | sqlite) is the natural next step when a
 * deployment target needs something other than local disk — left for a
 * follow-up PR per ADR-013.
 */

const SHARES_DIR = resolve(process.cwd(), '.decoro-shares');

const ensureDir = async () => {
  await mkdir(SHARES_DIR, { recursive: true });
};

const filePathFor = (id: string): string => {
  if (!SHARE_ID_PATTERN.test(id)) {
    // Validated callers pass through `getSnapshot`; this guard catches
    // direct misuse + makes it impossible to construct a path that escapes
    // SHARES_DIR via traversal (`..`, slashes), even by accident.
    throw new Error(`invalid share id: ${id}`);
  }
  return join(SHARES_DIR, `${id}.json`);
};

export const putSnapshot = async (record: SnapshotRecord): Promise<void> => {
  await ensureDir();
  const path = filePathFor(record.id);
  await writeFile(path, JSON.stringify(record), 'utf8');
};

/**
 * Returns `null` for missing snapshots. Returns `null` (not throws) for files
 * that exist but fail re-validation — read corruption shouldn't 500 the share
 * page, just look like a missing snapshot. Surfaces the parse error to logs
 * for the operator to diagnose.
 */
export const getSnapshot = async (
  id: string,
): Promise<SnapshotRecord | null> => {
  if (!SHARE_ID_PATTERN.test(id)) return null;
  let raw: string;
  try {
    raw = await readFile(filePathFor(id), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`[share-store] corrupt JSON for ${id}:`, err);
    return null;
  }
  const parsed = snapshotRecordSchema.safeParse(data);
  if (!parsed.success) {
    console.error(`[share-store] schema mismatch for ${id}:`, parsed.error);
    return null;
  }
  return parsed.data;
};
