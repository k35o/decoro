import { createModel } from '@decoro/llm-config';
import { type Spec, buildUserPrompt } from '@json-render/core';
import { type ModelMessage, streamText } from 'ai';
import { z } from 'zod';

import { adapter, llm } from '../../../../decoro.config.ts';
import { jsonError } from '../../../lib/api-response.ts';
import {
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  specSchema,
  toSpec,
} from '../../../lib/spec-schema.ts';

// `messageSchema` shape is local to this route — the LLM API takes
// `{role, content}` with a `system` role; the chat / share path uses
// `{id, role, text}` (see share-types.ts). Same per-message char limit.
const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
  currentSpec: specSchema.nullable().optional(),
});

// Ask the model to prefix the JSONL stream with a single short natural-
// language line summarizing what it's building. The chat pane surfaces this
// line back to the user as the assistant's "answer" — without it, the only
// visible feedback is the rendered preview, which feels mute mid-stream.
// `createMixedStreamParser` already distinguishes JSONL patch lines from
// prose, so the extra line lands in `onText` without disturbing patches.
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

// Universal spec discipline. Applies to every adapter — these are
// constraints of the json-render spec model and the catalog contract,
// not of any specific design system. The codegen also strips unknown
// props as belt-and-braces, but reminding the model up front is cheaper
// than repairing the spec downstream.
const specDisciplineInstruction = [
  'Spec discipline:',
  '- Set only the props each component declares in its catalog entry. Unknown props are silently dropped by codegen.',
  '- `children` is an array of OTHER element keys, not raw strings. To place literal text, use whatever text primitive the catalog provides (look for an entry like `Text`, or a `text` / `label` / `content` prop on the component itself).',
  '- If a parent has nothing to say, omit the child — do NOT insert an empty placeholder element.',
  '- Use ONLY components, props, and enum values that appear in the catalog. Do NOT invent component names, icon names, or option values from libraries the catalog does not list (Material Symbols, Heroicons, MUI, etc.) — they will not resolve and the preview will render raw text or an empty slot.',
].join('\n');

// Decoro is a design tool — users want to *see* their UI, not run it. The
// LLM's first instinct is to produce a state-bound interactive prototype
// (e.g. a chat with `$bindEach: '/messages'` over the message list, or
// `$cond` for sender-side bubble styling). With state empty, the preview
// renders nothing — the user complains "the UI hasn't changed", because
// it literally hasn't: the template is correct, the data is missing.
//
// Default to mockup-first generation. The user can opt into interactive
// behavior by asking explicitly.
const mockupFirstInstruction = [
  'Mockup-first generation:',
  '- Decoro is a design tool. Users want to SEE the UI populated, not wire up state.',
  '- Prefer STATIC content baked directly into the spec. Render 2–4 example items inline for chat / list / table / feed UIs so the preview is populated the moment generation finishes.',
  '- AVOID `$bindEach`, `$bindState`, `$cond`, `$item`, and action bindings (`pushState`, etc.) by default. They produce templates that render empty without state initialization.',
  '- For form UIs, leave inputs empty (the user fills them); for display UIs, show concrete example values directly in `props`.',
  '- Only use state bindings / actions when the user EXPLICITLY asks for an interactive prototype.',
].join('\n');

// Order matters. Catalog first (the model needs to know what exists),
// then library context (philosophy + library-specific gotchas from the
// adapter), then universal Decoro rules (spec discipline, mockup-first,
// response format). Library-specific guidance comes from
// `adapter.metadata.promptGuidance` so adapter authors can tell the LLM
// about THEIR library's quirks without touching this route.
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

const isMeaningfulSpec = (spec: Spec | null | undefined): spec is Spec =>
  spec !== null && spec !== undefined && spec.root !== '';

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

  const currentSpec = parsed.data.currentSpec
    ? toSpec(parsed.data.currentSpec)
    : null;
  const augmented = augmentLastUserMessage(parsed.data.messages, currentSpec);

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
