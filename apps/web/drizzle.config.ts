import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config for migrations + studio. Reads `DATABASE_URL` from
 * `apps/web/.env.local` (Next.js dev process picks it up automatically;
 * `drizzle-kit` needs to be told via `dotenv` or env-cli when run
 * standalone — current usage assumes the var is exported in the shell or
 * sourced before `pnpm db:*` runs).
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  // Migrations are checked in; we don't want drizzle-kit to push schema
  // changes implicitly. Always go through `db:generate` + review the SQL +
  // `db:migrate` to apply.
  strict: true,
  verbose: true,
});
