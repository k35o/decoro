import { jsonError } from '../../../../lib/api-response.ts';
import {
  deleteConversation,
  getConversation,
  updateConversation,
} from '../../../../lib/conversation-store.ts';
import { conversationInputSchema } from '../../../../lib/conversation-types.ts';

type Params = Promise<{ id: string }>;

/**
 * GET /api/conversations/[id]
 *
 * Returns the full conversation record (messages + spec + title +
 * timestamps). Used when the user picks a conversation from the sidebar
 * and the chat needs to be re-seeded with its full state.
 *
 * Returns 404 for missing or invalid ids; the route does not distinguish
 * "id format wrong" from "no such row" — both are equally "doesn't exist
 * as far as the client is concerned."
 */
export const GET = async (_req: Request, { params }: { params: Params }) => {
  const { id } = await params;
  try {
    const record = await getConversation(id);
    if (!record) return jsonError(404, 'Conversation not found');
    return Response.json(record);
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to load conversation',
    );
  }
};

/**
 * PATCH /api/conversations/[id]
 *
 * Overwrites the conversation's messages + spec + title. The chat hook
 * sends the full state on every assistant turn — small payloads, no
 * partial-update complexity, and the sidebar's `updated_at` ordering
 * stays correct via the column bump in `updateConversation`.
 */
export const PATCH = async (req: Request, { params }: { params: Params }) => {
  const { id } = await params;
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
  try {
    const ok = await updateConversation(id, parsed.data);
    if (!ok) return jsonError(404, 'Conversation not found');
    return new Response(null, { status: 204 });
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to update conversation',
    );
  }
};

/**
 * DELETE /api/conversations/[id]
 *
 * Removes the conversation row. There's no "soft delete" — the
 * conversation is gone for everyone in the deployment. Matches the team
 * trust model: the same person who can list conversations can also
 * remove them.
 */
export const DELETE = async (_req: Request, { params }: { params: Params }) => {
  const { id } = await params;
  try {
    const ok = await deleteConversation(id);
    if (!ok) return jsonError(404, 'Conversation not found');
    return new Response(null, { status: 204 });
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to delete conversation',
    );
  }
};
