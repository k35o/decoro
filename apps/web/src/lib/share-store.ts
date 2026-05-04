// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. The store touches the filesystem
// (`node:fs`, `process.cwd()`); an accidental client import would crash
// the browser bundle.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  SHARE_ID_PATTERN,
  type SnapshotRecord,
  snapshotRecordSchema,
} from './share-types.ts';

/**
 * Filesystem-backed snapshot store for shareable spec snapshots.
 *
 * Snapshots live as one JSON file per id under `<repo-root>/.decoro-shares/`
 * (gitignored). The store deliberately has no delete or update method:
 * snapshots are immutable for the lifetime of the deployment, and removing
 * a share means deleting the file by hand. Suits a single-user self-host
 * setup; multi-user / auth / lifecycle features are a follow-up.
 *
 * Storage location is fixed for now. A `decoro.config.ts` extension point
 * (filesystem | vercel-kv | sqlite | …) is the natural next step when a
 * deployment target needs something other than local disk.
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

/**
 * Sentinel error for callers (e.g. `POST /api/share`) to catch and react to
 * an id collision by regenerating the id and retrying. Carries `code: 'EEXIST'`
 * so callers can match Node's filesystem convention without depending on the
 * underlying error class.
 */
export class SnapshotExistsError extends Error {
  readonly code = 'EEXIST' as const;
  constructor(id: string) {
    super(`snapshot already exists: ${id}`);
    this.name = 'SnapshotExistsError';
  }
}

/**
 * Writes the snapshot exclusively (`flag: 'wx'`) — fails if a file already
 * exists at the same id. Snapshots are immutable per ADR-013; callers handle
 * the (astronomically rare) collision by regenerating the id and retrying.
 */
export const putSnapshot = async (record: SnapshotRecord): Promise<void> => {
  await ensureDir();
  const path = filePathFor(record.id);
  try {
    await writeFile(path, JSON.stringify(record), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new SnapshotExistsError(record.id);
    }
    throw err;
  }
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
