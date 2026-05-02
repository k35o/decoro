import { z } from 'zod';

import { MAX_MESSAGE_CHARS } from './spec-schema.ts';

/**
 * Single in-flight chat message shape — the canonical chat primitive.
 *
 * Used by:
 * - `useDecoroChat` (in-process React state)
 * - `<ChatPane>` (UI rendering)
 * - `<ShareView>` (read-only transcript)
 * - `snapshotInputSchema` (POST /api/share validates against this exact
 *   shape via `chatMessageSchema`)
 *
 * The schema and the type live next to each other so `z.infer` keeps the
 * validator and the in-process type in lockstep — they cannot drift.
 */
export const chatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_MESSAGE_CHARS),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
