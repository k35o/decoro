import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import { createModel } from '@decoro/llm-config';
import { type Spec, buildUserPrompt } from '@json-render/core';
import { type ModelMessage, streamText } from 'ai';

import { llm } from '../../../../decoro.config.ts';

type GenerateRequestBody = {
  messages: ModelMessage[];
  currentSpec?: Spec | null;
};

const systemPrompt = [
  arteOdysseyAdapter.catalog.prompt({ mode: 'standalone' }),
  '',
  'Library design principles:',
  arteOdysseyAdapter.metadata.designPrinciples,
].join('\n');

const isMeaningfulSpec = (spec: Spec | null | undefined): spec is Spec =>
  spec !== null && spec !== undefined && spec.root !== '';

/**
 * POST /api/generate streams the LLM's raw text output back to the client.
 *
 * The system prompt (built by `catalog.prompt({ mode: 'standalone' })`)
 * instructs the model to emit json-render JSON patches one per line, which
 * the client's `useDecoroChat` hook consumes via `createMixedStreamParser`.
 *
 * For iteration (M8): when `currentSpec` is supplied and non-empty, the last
 * user message is rewritten through `buildUserPrompt` so it includes the
 * current spec as edit context. Earlier messages stay verbatim — they were
 * past requests the model already satisfied.
 *
 * We deliberately do NOT wrap the response in `createUIMessageStream` /
 * `pipeJsonRender`. That pairing produces AI SDK's UI Message Stream
 * format (with `data-spec` SSE parts), which `useDecoroChat` /
 * `createMixedStreamParser` does not parse — pick that setup only when
 * migrating to AI SDK's own `useChat`.
 */
export const POST = async (req: Request) => {
  const body = (await req.json()) as GenerateRequestBody;
  const augmented = augmentLastUserMessage(body.messages, body.currentSpec);

  const result = streamText({
    model: createModel(llm),
    system: systemPrompt,
    messages: augmented,
  });

  return result.toTextStreamResponse();
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
