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
 * Module-level instantiation is intentional: Next.js dev hot-reloads route
 * handlers but keeps the module instance, so the pool is created once per
 * server lifetime instead of per request. In production (next start) the
 * same applies — one pool per process.
 */
const databaseUrl = process.env['DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy `.env.example` to `apps/web/.env.local` and start Postgres with `docker compose up -d` from the repo root.',
  );
}

const queryClient = postgres(databaseUrl, {
  // Default 10 concurrent connections is plenty for a self-hosted single-
  // instance Decoro. Bump if you put it behind a load balancer with high
  // concurrent traffic (and add PgBouncer in front).
  max: 10,
});

export const db = drizzle(queryClient, { schema });

export { schema };
