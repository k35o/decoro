import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Schema for Decoro's Postgres persistence (per ADR-015).
 *
 * `messages` and `spec` deliberately stay as `jsonb` rather than being
 * normalized into separate tables. Every read path wants the full
 * conversation as a unit (chat pane renders all messages together; preview
 * re-derives from the full spec), so normalization would cost joins on
 * every read with no query benefit. JSONB also keeps schema evolution on
 * the message / spec shape inside the TypeScript Zod layer
 * (`apps/web/src/lib/share-types.ts`, `chat-types.ts`, `spec-schema.ts`)
 * without DB migrations.
 */

/**
 * Immutable snapshots created via `/api/share` (ADR-013 model). Each row
 * captures a conversation + spec at a point in time. `parent_share_id`
 * points back at an earlier share when this snapshot was forked from one,
 * giving us lineage without a separate edges table.
 */
export const shares = pgTable('shares', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  schemaVersion: integer('schema_version').notNull(),
  messages: jsonb('messages').notNull(),
  spec: jsonb('spec').notNull(),
  parentShareId: text('parent_share_id'),
});

/**
 * Mutable per-team conversation rows. Decoro is a team-scoped self-host
 * (concept.md), so there is no per-user concept here — every conversation
 * is visible to anyone who can reach the deployment. `title` is a short
 * label for the sidebar; null means "derive from the first user message"
 * at render time.
 */
export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  title: text('title'),
  messages: jsonb('messages').notNull(),
  spec: jsonb('spec').notNull(),
});

export type ShareRow = typeof shares.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
