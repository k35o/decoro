import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import { createModel } from '@decoro/llm-config';
import type { Spec } from '@json-render/core';
import { buildUserPrompt, pipeJsonRender } from '@json-render/core';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';

import { llm } from '../../../../decoro.config.ts';

type GenerateRequestBody = {
  prompt: string;
  currentSpec?: Spec | null;
};

const systemPrompt = [
  arteOdysseyAdapter.catalog.prompt({ mode: 'standalone' }),
  '',
  'Library design principles:',
  arteOdysseyAdapter.metadata.designPrinciples,
].join('\n');

export const POST = async (req: Request) => {
  const body = (await req.json()) as GenerateRequestBody;

  const result = streamText({
    model: createModel(llm),
    system: systemPrompt,
    prompt: buildUserPrompt({
      prompt: body.prompt,
      currentSpec: body.currentSpec ?? undefined,
    }),
  });

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.merge(pipeJsonRender(result.toUIMessageStream()));
    },
  });

  return createUIMessageStreamResponse({ stream });
};
