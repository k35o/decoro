// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. Postgres connection lives here.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { desc, eq } from 'drizzle-orm';

import {
  CONVERSATION_ID_PATTERN,
  type ConversationInput,
  type ConversationRecord,
  type ConversationSummary,
  conversationRecordSchema,
} from './conversation-types.ts';
import { db, schema } from './db/client.ts';

/**
 * Postgres-backed conversation store. Symmetrical with `share-store.ts`,
 * but mutable: chats keep updating in place rather than producing
 * append-only snapshots.
 *
 * Read validation runs the row through `conversationRecordSchema` so a
 * JSONB column tampered with directly in the DB still falls back to
 * "looks missing" rather than crashing the chat page.
 */

const TITLE_FALLBACK_MAX_CHARS = 80;

/**
 * Fall back to a title derived from the first user message when the row
 * has no explicit title set. Truncates so the sidebar doesn't overflow.
 * "Untitled" is the last resort for genuinely empty conversations
 * (shouldn't happen — POST requires at least one message — but the type
 * is still nullable so be defensive).
 */
const deriveTitle = (
  title: string | null,
  messages: ConversationInput['messages'],
): string => {
  if (title !== null && title !== '') return title;
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser || firstUser.text === '') return 'Untitled';
  if (firstUser.text.length <= TITLE_FALLBACK_MAX_CHARS) return firstUser.text;
  return `${firstUser.text.slice(0, TITLE_FALLBACK_MAX_CHARS - 1)}…`;
};

export const listConversations = async (): Promise<ConversationSummary[]> => {
  const rows = await db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      messages: schema.conversations.messages,
      createdAt: schema.conversations.createdAt,
      updatedAt: schema.conversations.updatedAt,
    })
    .from(schema.conversations)
    .orderBy(desc(schema.conversations.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    title: deriveTitle(
      row.title,
      // The list-route projection returns the JSONB unparsed; cast to
      // the message-array shape we know it has (validated on every write).
      row.messages as ConversationInput['messages'],
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
};

export const getConversation = async (
  id: string,
): Promise<ConversationRecord | null> => {
  if (!CONVERSATION_ID_PATTERN.test(id)) return null;
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const parsed = conversationRecordSchema.safeParse({
    id: row.id,
    title: row.title,
    messages: row.messages,
    spec: row.spec,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
  if (!parsed.success) {
    console.error(
      `[conversation-store] schema mismatch for ${id}:`,
      parsed.error,
    );
    return null;
  }
  return parsed.data;
};

/**
 * Inserts a new conversation row. Generates `created_at` / `updated_at`
 * via the column defaults so the server clock owns the timestamps.
 */
export const createConversation = async (
  id: string,
  input: ConversationInput,
): Promise<void> => {
  await db.insert(schema.conversations).values({
    id,
    title: input.title ?? null,
    messages: input.messages,
    spec: input.spec,
  });
};

/**
 * Overwrites an existing conversation row with the latest state. `updated_at`
 * is bumped to the current time so the sidebar's most-recent ordering stays
 * correct.
 *
 * `title` semantics: undefined means "leave the existing title alone",
 * `null` means "explicitly clear" (fall back to the derived title), a
 * string means "set". The chat hook saves on every assistant turn
 * without sending `title`, so we must NOT overwrite a user-set title
 * just because the auto-save call omitted the field.
 *
 * Returns whether the update touched a row — false means the id was
 * unknown (the route maps that to a 404).
 */
export const updateConversation = async (
  id: string,
  input: ConversationInput,
): Promise<boolean> => {
  if (!CONVERSATION_ID_PATTERN.test(id)) return false;
  const set: {
    messages: ConversationInput['messages'];
    spec: ConversationInput['spec'];
    updatedAt: Date;
    title?: string | null;
  } = {
    messages: input.messages,
    spec: input.spec,
    updatedAt: new Date(),
  };
  if (input.title !== undefined) {
    set.title = input.title;
  }
  const result = await db
    .update(schema.conversations)
    .set(set)
    .where(eq(schema.conversations.id, id))
    .returning({ id: schema.conversations.id });
  return result.length > 0;
};

export const deleteConversation = async (id: string): Promise<boolean> => {
  if (!CONVERSATION_ID_PATTERN.test(id)) return false;
  const result = await db
    .delete(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .returning({ id: schema.conversations.id });
  return result.length > 0;
};
