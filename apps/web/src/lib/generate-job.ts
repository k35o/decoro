// `server-only` is a side-effect import that makes the bundler refuse
// to include this module in client code. The job calls `streamText`
// with server credentials and writes to the DB.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { createModel } from '@decoro/llm-config';
import {
  type Spec,
  applySpecPatch,
  buildUserPrompt,
  createMixedStreamParser,
} from '@json-render/core';
import { type ModelMessage, streamText } from 'ai';

import { adapter, llm } from '../../decoro.config.ts';
import type { ChatMessage } from './chat-types.ts';
import { updateConversation } from './conversation-store.ts';
import { startJob } from './job-store.ts';

// Ask the model to prefix the JSONL stream with a single short natural-
// language line summarizing what it's building.
const responsePreambleInstruction = [
  'Response format (STRICT — the chat UI parses prose vs JSON by line):',
  '- Line 1: exactly ONE short sentence (≤ 15 words) describing what you are building or changing in this turn. Plain prose, no JSON, no leading whitespace.',
  '- Line 1 MUST end with a literal newline character before any JSON appears. Do not place JSON on the same line as the sentence.',
  '- Lines 2+: JSONL patch lines, one complete JSON object per line. No prose between or after the patches.',
  '- Example shape:',
  '    Adding a primary submit button.\\n',
  '    {"op":"add","path":"/elements/btn","value":{"type":"Button","props":{"label":"Save"},"children":[]}}\\n',
  '    {"op":"replace","path":"/root","value":"btn"}\\n',
].join('\n');

// Universal spec discipline — applies to every adapter; it's a json-render
// spec / catalog contract concern, not a design-system one.
const specDisciplineInstruction = [
  'Spec discipline:',
  '- Set only the props each component declares in its catalog entry. Unknown props are silently dropped by codegen.',
  '- `children` is an array of OTHER element keys, not raw strings. To place literal text, use whatever text primitive the catalog provides (look for an entry like `Text`, or a `text` / `label` / `content` prop on the component itself).',
  '- If a parent has nothing to say, omit the child — do NOT insert an empty placeholder element.',
  '- Use ONLY components, props, and enum values that appear in the catalog. Do NOT invent component names, icon names, or option values from libraries the catalog does not list (Material Symbols, Heroicons, MUI, etc.) — they will not resolve and the preview will render raw text or an empty slot.',
].join('\n');

// Decoro is a design tool — users want to *see* their UI, not run it.
const mockupFirstInstruction = [
  'Mockup-first generation:',
  '- Decoro is a design tool. Users want to SEE the UI populated, not wire up state.',
  '- Prefer STATIC content baked directly into the spec. Render 2–4 example items inline for chat / list / table / feed UIs so the preview is populated the moment generation finishes.',
  '- AVOID `$bindEach`, `$bindState`, `$cond`, `$item`, and action bindings (`pushState`, etc.) by default. They produce templates that render empty without state initialization.',
  '- For form UIs, leave inputs empty (the user fills them); for display UIs, show concrete example values directly in `props`.',
  '- Only use state bindings / actions when the user EXPLICITLY asks for an interactive prototype.',
].join('\n');

const systemPrompt = [
  adapter.catalog.prompt({ mode: 'standalone' }),
  '',
  'Library design principles:',
  adapter.metadata.designPrinciples,
  ...(adapter.metadata.promptGuidance === undefined
    ? []
    : ['', adapter.metadata.promptGuidance]),
  '',
  specDisciplineInstruction,
  '',
  mockupFirstInstruction,
  '',
  responsePreambleInstruction,
].join('\n');

const isMeaningfulSpec = (spec: Spec): boolean =>
  spec.root !== '' && Object.keys(spec.elements).length > 0;

/**
 * Convert a Decoro `ChatMessage` to the AI SDK `ModelMessage` shape.
 *
 * Text-only messages stay as `content: string` (the SDK's narrow
 * happy path; cheaper to serialize over the wire). When the user
 * attached images, switch to the multimodal array shape:
 * `[{type:'text'}, {type:'file', mediaType, data: <data URI>}]`.
 *
 * `'file'` (not `'image'`) is the AI SDK v5 part type for binary
 * media. Anthropic / Google / Vercel AI Gateway providers all accept
 * `data:` URIs natively; we don't need to base64-decode.
 */
const toModelMessage = (m: ChatMessage): ModelMessage => {
  if (m.role === 'assistant') {
    // The LLM SDK only accepts simple text content for prior assistant
    // turns in a multi-turn conversation; assistant messages never
    // carry attachments anyway.
    return { role: 'assistant', content: m.text };
  }
  if (!m.attachments || m.attachments.length === 0) {
    return { role: 'user', content: m.text };
  }
  return {
    role: 'user',
    content: [
      ...(m.text === '' ? [] : [{ type: 'text' as const, text: m.text }]),
      ...m.attachments.map((a) => ({
        type: 'file' as const,
        mediaType: a.mediaType,
        data: a.dataUri,
      })),
    ],
  };
};

type UserModelMessage = Extract<ModelMessage, { role: 'user' }>;

/**
 * Replace the text content of a user message with `newText`, leaving
 * any image parts (in the multimodal array form) intact. The caller
 * has already verified the message is `role: 'user'`.
 */
const replaceUserText = (
  msg: UserModelMessage,
  newText: string,
): UserModelMessage => {
  if (typeof msg.content === 'string') {
    return { ...msg, content: newText };
  }
  const firstTextIdx = msg.content.findIndex((p) => p.type === 'text');
  if (firstTextIdx < 0) {
    return {
      ...msg,
      content: [{ type: 'text', text: newText }, ...msg.content],
    };
  }
  const nextContent = msg.content.map((part, i) =>
    i === firstTextIdx && part.type === 'text'
      ? { ...part, text: newText }
      : part,
  );
  return { ...msg, content: nextContent };
};

const buildLlmMessages = (
  messages: ChatMessage[],
  inputSpec: Spec,
): ModelMessage[] => {
  const llmMessages: ModelMessage[] = messages
    .filter((m) => !(m.role === 'assistant' && m.text === ''))
    .map((m) => toModelMessage(m));
  const lastIdx = llmMessages.length - 1;
  if (lastIdx < 0) return llmMessages;
  const last = llmMessages[lastIdx];
  if (last?.role !== 'user') return llmMessages;
  // Find the existing text in the last user message — string-shaped if
  // it's text-only, or the first text part of the multimodal array —
  // and rewrite it through `buildUserPrompt` so the LLM sees the
  // current spec as edit context (M8 iteration). Image parts pass
  // through unchanged.
  let existingText: string;
  if (typeof last.content === 'string') {
    existingText = last.content;
  } else {
    const textPart = last.content.find((p) => p.type === 'text');
    existingText = textPart?.type === 'text' ? textPart.text : '';
  }
  const augmented = buildUserPrompt({
    prompt: existingText,
    currentSpec: isMeaningfulSpec(inputSpec) ? inputSpec : undefined,
  });
  llmMessages[lastIdx] = replaceUserText(last, augmented);
  return llmMessages;
};

/**
 * Hard ceiling on how much the model may emit in a single turn. Sized
 * for "verbose UI spec for a complex screen" with margin (a typical
 * full mockup spec runs ~5k tokens; 8k leaves headroom for nested
 * layouts), but tight enough to kill a runaway in seconds when a model
 * loops on the prose preamble or the JSONL never converges. The
 * `streamText` abort propagates through the job's signal, so an
 * over-cap turn fails fast instead of running for minutes.
 */
const MAX_OUTPUT_TOKENS = 8000;

const normalizeSpecForDb = (spec: Spec) => ({
  root: spec.root,
  elements: Object.fromEntries(
    Object.entries(spec.elements).map(([k, v]) => [
      k,
      { ...v, children: v.children ?? [] },
    ]),
  ),
  ...(spec.state === undefined ? {} : { state: spec.state }),
});

/**
 * Spawns a background LLM stream tied to `conversationId`. Cancels any
 * previous job for the same conversation, streams chunks into the job
 * store (which serves the SSE channel), and PATCHes the conversation
 * row with final state on completion.
 *
 * Fire-and-forget from the route: the caller awaits nothing and
 * returns to the client immediately. Errors are reported through the
 * job's `fail` event so subscribers see them on the SSE channel.
 */
export const startGenerateJob = (params: {
  conversationId: string;
  seedMessages: ChatMessage[];
  seedSpec: Spec;
}): void => {
  const { conversationId, seedMessages, seedSpec } = params;
  const job = startJob(conversationId);
  const llmMessages = buildLlmMessages(seedMessages, seedSpec);

  void (async () => {
    let buffer = '';
    try {
      const result = streamText({
        model: createModel(llm),
        system: systemPrompt,
        messages: llmMessages,
        abortSignal: job.signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });

      for await (const chunk of result.textStream) {
        if (job.signal.aborted) return;
        buffer += chunk;
        job.appendChunk(chunk);
      }

      // Surface provider-level errors that didn't throw on the
      // textStream but flipped the finish reason. Subscription rate
      // limits, content filters, and provider 5xxs all land here. We
      // only know the model "stopped because of an error" — the
      // detailed message lives in `result.warnings` or got logged
      // earlier by the provider itself, not surfaced via a thrown
      // exception.
      const finishReason = await result.finishReason;
      if (finishReason === 'error') {
        const warnings = await result.warnings;
        const detail = warnings
          ?.map((w) =>
            'message' in w ? (w as { message?: string }).message : undefined,
          )
          .filter((m): m is string => typeof m === 'string' && m !== '')
          .join('; ');
        job.fail(
          detail !== undefined && detail !== ''
            ? detail
            : 'The model stopped with an error. Check the server logs for the underlying provider message (rate limit, content filter, etc.).',
        );
        return;
      }

      // Parse the full buffer to compute the final assistant text + spec
      // for the DB write. Same parser the client uses, so both sides
      // stay byte-for-byte consistent.
      let assistantText = '';
      const finalSpec: Spec = {
        root: seedSpec.root,
        elements: { ...seedSpec.elements },
        ...(seedSpec.state ? { state: { ...seedSpec.state } } : {}),
      };
      const parser = createMixedStreamParser({
        onText(text) {
          assistantText += text;
        },
        onPatch(patch) {
          applySpecPatch(finalSpec, patch);
        },
      });
      parser.push(buffer);
      parser.flush();

      const cleaned = seedMessages.filter(
        (m) => !(m.role === 'assistant' && m.text === ''),
      );
      const finalMessages: ChatMessage[] = [
        ...cleaned,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: assistantText,
        },
      ];

      await updateConversation(conversationId, {
        messages: finalMessages,
        spec: normalizeSpecForDb(finalSpec),
      });
      job.complete();
    } catch (err) {
      if (job.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Stream failed';
      console.error('[generate-job] stream failed:', err);
      job.fail(message);
    }
  })();
};
