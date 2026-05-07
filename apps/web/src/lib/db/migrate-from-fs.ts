/**
 * One-shot migrator: reads `<repo-root>/.decoro-shares/*.json` (the legacy
 * filesystem snapshot store from ADR-013) and inserts each record into the
 * Postgres `shares` table.
 *
 * Idempotent: snapshots that already exist in Postgres are skipped (the
 * primary-key collision short-circuits with a counter bump rather than an
 * error). Re-running the script after a partial first run is safe.
 *
 * Run with: `pnpm migrate:from-fs` from `apps/web/`. Make sure
 * `DATABASE_URL` is in `.env.local` and the schema is migrated first
 * (`pnpm db:migrate`).
 *
 * After a successful run, the `.decoro-shares/` directory can be removed
 * by hand. The script does NOT delete it — preserving the source files
 * gives the operator a recovery path if the Postgres data is lost.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { snapshotRecordSchema } from '../share-types.ts';
import * as schema from './schema.ts';

// Build a Drizzle client inline rather than importing `./client.ts`. The
// runtime client pulls in `server-only`, which resolves correctly inside
// the Next.js bundler but fails as a plain `tsx` script (no bundler =
// no alias). This script only runs ad-hoc from the CLI, so reconstructing
// the connection here keeps it self-contained.
const databaseUrl = process.env['DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error(
    'DATABASE_URL is not set. Source `apps/web/.env.local` or export it before running this script.',
  );
}
const queryClient = postgres(databaseUrl, { max: 2 });
const db = drizzle(queryClient, { schema });

const SHARES_DIR = resolve(process.cwd(), '.decoro-shares');

const main = async () => {
  let entries: string[];
  try {
    entries = await readdir(SHARES_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(
        `[migrate-from-fs] no ${SHARES_DIR} directory; nothing to migrate.`,
      );
      return;
    }
    throw err;
  }

  const jsonFiles = entries.filter((name) => name.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.warn('[migrate-from-fs] no JSON snapshots found.');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of jsonFiles) {
    const path = join(SHARES_DIR, name);
    let raw: string;
    try {
      // oxlint-disable-next-line eslint(no-await-in-loop)
      raw = await readFile(path, 'utf8');
    } catch (err) {
      console.error(`[migrate-from-fs] read failed for ${name}:`, err);
      failed += 1;
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`[migrate-from-fs] corrupt JSON in ${name}:`, err);
      failed += 1;
      continue;
    }
    const parsed = snapshotRecordSchema.safeParse(data);
    if (!parsed.success) {
      console.error(
        `[migrate-from-fs] schema mismatch in ${name}:`,
        parsed.error.message,
      );
      failed += 1;
      continue;
    }
    const record = parsed.data;
    try {
      // Sequential awaits — INSERTs are quick, dataset is small (dozens
      // of dogfood snapshots at most), and parallelizing would only make
      // the failure log harder to read.
      // oxlint-disable-next-line eslint(no-await-in-loop)
      await db.insert(schema.shares).values({
        id: record.id,
        createdAt: new Date(record.createdAt),
        schemaVersion: record.schemaVersion,
        messages: record.messages,
        spec: record.spec,
        parentShareId: null,
      });
      inserted += 1;
    } catch (err) {
      // Unique-violation = already migrated. Drizzle may wrap the
      // postgres-js PostgresError in its own DrizzleQueryError, so check
      // both `err.code` and `err.cause.code` for the SQLSTATE.
      const code =
        typeof err === 'object' && err !== null
          ? ((err as { code?: string }).code ??
            (err as { cause?: { code?: string } }).cause?.code)
          : undefined;
      if (code === '23505') {
        skipped += 1;
      } else {
        console.error(`[migrate-from-fs] insert failed for ${name}:`, err);
        failed += 1;
      }
    }
  }

  console.warn(
    `[migrate-from-fs] done. inserted=${inserted.toString()} skipped=${skipped.toString()} failed=${failed.toString()}`,
  );
  if (failed > 0) {
    process.exit(1);
  }
};

try {
  await main();
} catch (err) {
  console.error('[migrate-from-fs] fatal:', err);
  process.exitCode = 1;
} finally {
  await queryClient.end();
}
