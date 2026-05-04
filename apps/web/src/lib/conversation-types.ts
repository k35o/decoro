import { z } from 'zod';

import { chatMessageSchema } from './chat-types.ts';
import { MAX_MESSAGES, specSchema } from './spec-schema.ts';

/**
 * Per-team conversation persistence (per ADR-015). Decoro is a team-scoped
 * self-host (concept.md), so there is no per-user identity here — every
 * conversation in the deployment is visible to anyone who can reach the
 * server, just like shares.
 *
 * Conversations are MUTABLE (unlike shares): every chat turn updates the
 * row in place, the sidebar shows the latest snapshot, and the operator
 * can come back to any past conversation and keep typing.
 */

/**
 * URL-safe base64 id, same shape and entropy as `SHARE_ID_PATTERN` in
 * share-types. Reused so callers can validate an id received from a URL
 * without caring whether it's a share or a conversation; the routes
 * separate the namespaces.
 */
export const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export const newConversationId = (): string => {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const b of bytes) str += String.fromCodePoint(b);
  return btoa(str)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const MAX_TITLE_CHARS = 120;

/**
 * Body schema for `POST /api/conversations` and `PATCH /api/conversations/[id]`.
 * Both endpoints accept the same shape — POST seeds a new row, PATCH
 * overwrites the messages / spec / title of an existing one. The chat hook
 * sends the full conversation state on every save (small payloads, no
 * partial-update complexity).
 */
export const conversationInputSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  spec: specSchema,
  title: z.string().min(1).max(MAX_TITLE_CHARS).nullable().optional(),
});

/**
 * Full row shape returned from the API. `title` is nullable in the DB; the
 * sidebar derives a fallback ("Untitled" / first user-message excerpt) at
 * render time when it's null.
 */
export const conversationRecordSchema = conversationInputSchema.extend({
  id: z.string().regex(CONVERSATION_ID_PATTERN),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  title: z.string().min(1).max(MAX_TITLE_CHARS).nullable(),
});

/**
 * Light-weight shape for the sidebar list — drops the heavy `messages` /
 * `spec` JSONB so the list endpoint stays fast even with many rows. Title
 * is server-resolved (uses the column when set, else the first user
 * message, truncated).
 */
export const conversationSummarySchema = z.object({
  id: z.string().regex(CONVERSATION_ID_PATTERN),
  title: z.string().min(1).max(MAX_TITLE_CHARS),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConversationInput = z.infer<typeof conversationInputSchema>;
export type ConversationRecord = z.infer<typeof conversationRecordSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
