import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import { createModel } from '@decoro/llm-config';
import { type Spec, buildUserPrompt } from '@json-render/core';
import { type ModelMessage, streamText } from 'ai';
import { z } from 'zod';

import { llm } from '../../../../decoro.config.ts';

// Limits sized for "self-hosted, trusted-network MVP". Generous enough that
// real chat sessions never bump them, tight enough that a runaway client or
// hostile insider cannot DoS the endpoint or rack up an unbounded LLM bill.
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 4000;
const MAX_SPEC_ELEMENTS = 200;
const MAX_ELEMENT_CHILDREN = 50;
const MAX_COMPONENT_TYPE_CHARS = 50;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const elementSchema = z.object({
  type: z.string().min(1).max(MAX_COMPONENT_TYPE_CHARS),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string()).max(MAX_ELEMENT_CHILDREN),
  visible: z.unknown().optional(),
});

const specSchema = z
  .object({
    root: z.string(),
    elements: z
      .record(z.string(), elementSchema)
      .refine(
        (e) => Object.keys(e).length <= MAX_SPEC_ELEMENTS,
        `spec exceeds max ${MAX_SPEC_ELEMENTS.toString()} elements`,
      ),
    state: z.unknown().optional(),
  })
  .nullable()
  .optional();

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
  currentSpec: specSchema,
});

// Ask the model to prefix the JSONL stream with a single short natural-
// language line summarizing what it's building. The chat pane surfaces this
// line back to the user as the assistant's "answer" — without it, the only
// visible feedback is the rendered preview, which feels mute mid-stream.
// `createMixedStreamParser` already distinguishes JSONL patch lines from
// prose, so the extra line lands in `onText` without disturbing patches.
const responsePreambleInstruction = [
  'Response format:',
  '- First, output exactly ONE short sentence (≤ 15 words) describing what you are building or changing in this turn. Plain prose, no JSON. End with a newline.',
  '- Then emit the JSONL patch lines as instructed above.',
  '- Do not emit any prose between or after the patches.',
].join('\n');

const systemPrompt = [
  arteOdysseyAdapter.catalog.prompt({ mode: 'standalone' }),
  '',
  'Library design principles:',
  arteOdysseyAdapter.metadata.designPrinciples,
  '',
  responsePreambleInstruction,
].join('\n');

const isMeaningfulSpec = (spec: Spec | null | undefined): spec is Spec =>
  spec !== null && spec !== undefined && spec.root !== '';

const jsonError = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * POST /api/generate streams the LLM's raw text output back to the client.
 *
 * The system prompt (built by `catalog.prompt({ mode: 'standalone' })`)
 * instructs the model to emit json-render JSON patches one per line, which
 * the client's `useDecoroChat` hook consumes via `createMixedStreamParser`.
 *
 * For iteration: when `currentSpec` is supplied and non-empty, the last user
 * message is rewritten through `buildUserPrompt` so it includes the current
 * spec as edit context. Earlier messages stay verbatim.
 *
 * Input is validated with zod and capped (messages count / per-message
 * length / spec element count) so a runaway client cannot DoS the endpoint
 * or rack up an unbounded LLM bill.
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

  // The zod schema enforces shape and size limits; downstream consumers
  // (json-render's buildUserPrompt, the registry) accept the wider Spec
  // type. Cast is safe — anything the schema accepts is structurally a Spec.
  const augmented = augmentLastUserMessage(
    parsed.data.messages,
    (parsed.data.currentSpec ?? null) as Spec | null,
  );

  try {
    const result = streamText({
      model: createModel(llm),
      system: systemPrompt,
      messages: augmented,
    });
    return result.toTextStreamResponse();
  } catch (err) {
    return jsonError(
      500,
      err instanceof Error ? err.message : 'Failed to start generation',
    );
  }
};

const augmentLastUserMessage = (
  messages: ModelMessage[],
  currentSpec: Spec | null | undefined,
): ModelMessage[] => {
  const lastIdx = messages.length - 1;
  return messages.map((msg, idx) => {
    if (idx !== lastIdx || msg.role !== 'user') return msg;
    if (typeof msg.content !== 'string') return msg;
    return {
      ...msg,
      content: buildUserPrompt({
        prompt: msg.content,
        currentSpec: isMeaningfulSpec(currentSpec) ? currentSpec : undefined,
      }),
    };
  });
};
