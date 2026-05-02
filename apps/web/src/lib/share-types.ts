import { z } from 'zod';

import { MAX_MESSAGE_CHARS, MAX_MESSAGES, specSchema } from './spec-schema.ts';

/**
 * Shared Zod schemas + types for share snapshots (see ADR-013, Tier 2).
 *
 * The `spec` validator is shared with `/api/generate`; the message shape
 * differs (the share snapshot carries the full chat-pane shape `{id, role,
 * text}` rather than the LLM API's `{role, content}`), so the message
 * schema lives here.
 *
 * Stored snapshots are validated on both ingest (POST) and read (GET) — read
 * validation is defense-in-depth in case the on-disk file is tampered with
 * outside the API.
 */

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

/**
 * Lightweight URL-safe id (12 chars, ~71 bits of entropy). Short enough that
 * shared URLs stay readable; long enough that random-guess access is
 * astronomically unlikely. Distinct from `crypto.randomUUID()` (36 chars
 * with hyphens) which we use for in-process message IDs.
 */
export const newShareId = (): string => {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const b of bytes) str += String.fromCodePoint(b);
  return btoa(str)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const chatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_MESSAGE_CHARS),
});

export const snapshotInputSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  spec: specSchema,
});

export const snapshotRecordSchema = snapshotInputSchema.extend({
  id: z.string().regex(SHARE_ID_PATTERN),
  createdAt: z.iso.datetime(),
  schemaVersion: z.literal(1),
});

export type SnapshotInput = z.infer<typeof snapshotInputSchema>;
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;
/**
 * The single in-flight chat message shape. Used by:
 * - `useDecoroChat` (in-process)
 * - `<ChatPane>` (UI)
 * - `<ShareView>` (read-only transcript)
 * - snapshot bodies (POST/GET to /api/share, validated by `chatMessageSchema`)
 *
 * Kept here so the schema and the type stay in lockstep — `z.infer` would
 * disagree with a hand-written type if the schema drifts.
 */
export type ChatMessage = z.infer<typeof chatMessageSchema>;
