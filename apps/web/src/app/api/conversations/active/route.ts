import { runningConversationIds } from '../../../../lib/job-store.ts';

/**
 * GET /api/conversations/active
 *
 * Returns the ids of conversations with an in-flight LLM job (per
 * ADR-016). The sidebar polls this so the user can see which
 * conversations are currently generating in the background — a
 * teammate started something, or the operator's own previous turn is
 * still running while they explore another conversation.
 *
 * Cheap: in-memory lookup, no DB hit. The sidebar polls at 2 s
 * intervals; under that load this is essentially free.
 */
export const GET = () =>
  Response.json({ conversationIds: runningConversationIds() });
