import { jsonError } from '../../../lib/api-response.ts';
import {
  createConversation,
  listConversations,
} from '../../../lib/conversation-store.ts';
import {
  conversationInputSchema,
  newConversationId,
} from '../../../lib/conversation-types.ts';

/**
 * GET /api/conversations
 *
 * Returns the lightweight summary list for the sidebar (id + derived
 * title + timestamps). Newest-updated first.
 *
 * No auth — same trust model as `/api/share` and `/api/generate` per
 * ADR-013 ("self-hosted, trusted-network MVP"). Anyone reaching the
 * server sees every conversation, by design.
 */
export const GET = async () => {
  try {
    const summaries = await listConversations();
    return Response.json({ conversations: summaries });
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to list conversations',
    );
  }
};

/**
 * POST /api/conversations
 *
 * Creates a new conversation row from the supplied messages + spec. Used
 * when the chat hook reaches the end of its first stream and needs to
 * persist the result, and when "Continue this conversation" forks a
 * shared snapshot into a fresh conversation.
 */
export const POST = async (req: Request) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON');
  }

  const parsed = conversationInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, parsed.error.message);
  }

  const id = newConversationId();
  try {
    await createConversation(id, parsed.data);
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to create conversation',
    );
  }

  return Response.json({ id }, { status: 201 });
};
