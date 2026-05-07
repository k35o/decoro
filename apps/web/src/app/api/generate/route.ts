import { z } from 'zod';

import { jsonError } from '../../../lib/api-response.ts';
import { chatMessageSchema } from '../../../lib/chat-types.ts';
import {
  createConversation,
  getConversation,
  updateConversation,
} from '../../../lib/conversation-store.ts';
import {
  CONVERSATION_ID_PATTERN,
  newConversationId,
} from '../../../lib/conversation-types.ts';
import { startGenerateJob } from '../../../lib/generate-job.ts';
import { MAX_MESSAGES, specSchema, toSpec } from '../../../lib/spec-schema.ts';

const requestSchema = z.object({
  /**
   * `null` / omitted on the first turn of a fresh chat. Otherwise, the
   * id of the conversation row this turn should attach to. Forks from a
   * shared snapshot also start with `null` — the first send mints a new
   * row, leaving the source share immutable.
   */
  conversationId: z
    .string()
    .regex(CONVERSATION_ID_PATTERN)
    .nullable()
    .optional(),
  /**
   * Full conversation messages including the user message that just got
   * typed. Server-side, the last user message is rewritten via
   * `buildUserPrompt` so the LLM receives the current spec as edit
   * context (M8 iteration loop).
   */
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  /**
   * Spec the user is iterating ON. Empty (`{ root: '', elements: {} }`)
   * for the first turn; otherwise the result of the previous turn. Used
   * both for `buildUserPrompt` context and as the persisted `spec` on
   * the conversation row when this is a fresh create.
   */
  spec: specSchema,
});

/**
 * POST /api/generate kicks off an LLM stream **on the server** and
 * returns immediately with the conversationId. The actual stream lives
 * in the in-memory job store keyed by conversationId; clients subscribe
 * to it via `GET /api/conversations/[id]/events` (SSE). See ADR-016.
 *
 * Flow:
 *   1. Validate the request, then mint or look up the conversation row.
 *      Brand-new conversations get persisted with the user message
 *      immediately so the URL can update before the LLM responds.
 *   2. `startGenerateJob` cancels any previous job for this
 *      conversation, spawns the background `streamText`, and PATCHes
 *      the row on completion.
 *   3. Return `{ conversationId }`. The browser opens (or has already
 *      opened) the SSE channel and receives the stream there.
 */
export const POST = async (req: Request) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON');
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, parsed.error.message);
  }

  const inputSpec = toSpec(parsed.data.spec);
  const inputMessages = parsed.data.messages;

  let conversationId: string;
  if (
    parsed.data.conversationId === undefined ||
    parsed.data.conversationId === null
  ) {
    conversationId = newConversationId();
    try {
      await createConversation(conversationId, {
        messages: inputMessages,
        spec: parsed.data.spec,
      });
    } catch (err) {
      return jsonError(
        500,
        err instanceof Error ? err.message : 'Failed to create conversation',
      );
    }
  } else {
    ({ conversationId } = parsed.data);
    const existing = await getConversation(conversationId);
    if (!existing) {
      return jsonError(404, 'Conversation not found');
    }
    // Persist the new user message + current spec immediately so any
    // mid-stream subscriber that fetches conversation state sees it
    // before the assistant turn lands. The post-stream PATCH inside
    // `startGenerateJob` overwrites with the full state once the LLM
    // finishes.
    await updateConversation(conversationId, {
      messages: inputMessages,
      spec: parsed.data.spec,
    });
  }

  startGenerateJob({
    conversationId,
    seedMessages: inputMessages,
    seedSpec: inputSpec,
  });

  return Response.json({ conversationId });
};
