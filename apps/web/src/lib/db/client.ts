// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. The Postgres driver and connection
// string are server-side only.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.ts';

/**
 * Singleton Postgres connection pool + Drizzle client.
 *
 * Lazy-initialized on first access. Module-level eager init was the
 * original shape, but Next.js's build step does a "collect page data"
 * pass that imports route modules without runtime env vars present.
 * Eagerly throwing on missing `DATABASE_URL` failed the build for any
 * deployment that wires the env in at runtime (Vercel, Docker run,
 * etc.). Deferring lets module evaluation succeed and surfaces the
 * config error only when the connection is actually used.
 *
 * Once a pool is created it persists for the process lifetime —
 * Next dev hot-reloads route handlers but keeps the module instance,
 * and `next start` runs one process per worker.
 */

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: DrizzleDb | null = null;

const ensureDb = (): DrizzleDb => {
  if (dbInstance) return dbInstance;
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error(
      'DATABASE_URL is not set. Copy `.env.example` to `apps/web/.env.local` and start Postgres with `docker compose up -d` from the repo root.',
    );
  }
  // Default 10 concurrent connections is plenty for a self-hosted
  // single-instance Decoro. Bump if you put it behind a load
  // balancer with high concurrent traffic (and add PgBouncer in front).
  dbInstance = drizzle(postgres(databaseUrl, { max: 10 }), { schema });
  return dbInstance;
};

/**
 * Proxy that defers initialization until the first method call. Caller
 * code keeps writing `db.select(...)` / `db.insert(...)` as if the
 * client were eagerly created.
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(ensureDb(), prop, receiver) as unknown;
  },
});

export { schema };
