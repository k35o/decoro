import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import { createModel } from '@decoro/llm-config';
import { type ModelMessage, streamText } from 'ai';

import { llm } from '../../../../decoro.config.ts';

type GenerateRequestBody = {
  messages: ModelMessage[];
};

const systemPrompt = [
  arteOdysseyAdapter.catalog.prompt({ mode: 'standalone' }),
  '',
  'Library design principles:',
  arteOdysseyAdapter.metadata.designPrinciples,
].join('\n');

/**
 * Streams the LLM's raw text output back to the client. The system prompt
 * (built by `catalog.prompt({ mode: 'standalone' })`) instructs the model to
 * emit json-render JSON patches one per line, which `useChatUI`'s
 * `createMixedStreamParser` consumes directly.
 *
 * We deliberately do NOT wrap the result in `createUIMessageStream` /
 * `pipeJsonRender` — that pairing produces AI SDK's UI Message Stream format
 * (with `data-spec` SSE parts), which `useChatUI` does not parse. Pick that
 * setup only when migrating to AI SDK's own `useChat` hook.
 */
export const POST = async (req: Request) => {
  const body = (await req.json()) as GenerateRequestBody;

  const result = streamText({
    model: createModel(llm),
    system: systemPrompt,
    messages: body.messages,
  });

  return result.toTextStreamResponse();
};
