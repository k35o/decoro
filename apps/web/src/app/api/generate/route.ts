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

// ArteOdyssey components do not accept `className` (the design system
// chooses styling internally). Only the layout HTML elements (div, section,
// header, main) accept className, and only from the curated allowlist
// declared in their schema. Codegen also strips unknown props as
// belt-and-braces, but reminding the model up front is cheaper than
// repairing the spec downstream.
const propsDisciplineInstruction = [
  'Prop discipline:',
  '- Set only the props each component declares in its catalog entry.',
  '- Do NOT add `className` to ArteOdyssey components (Button, Card, FormControl, TextField, etc.). They control their own styling.',
  '- `className` is allowed ONLY on layout HTML elements (div, section, header, main), and only with the allowlisted utility tokens shown in their schema.',
].join('\n');

// Icons matter — chatbot / dashboard / nav UIs lean heavily on them and the
// LLM defaults to Material Symbols / Heroicons names because that's the
// dominant training data. Those names do not resolve in ArteOdyssey and
// render as raw text in the preview. The `Icon` catalog entry already
// constrains `name` to a Zod enum of valid ArteOdyssey icons; this
// instruction makes the constraint visible up front.
const iconUsageInstruction = [
  'Icons:',
  '- Use the `Icon` component with its `name` prop set to one of the names in the catalog enum (e.g. `<Icon name="HistoryIcon" />`).',
  '- For icon-only actions, use `IconButton` with one `Icon` child: `<IconButton label="History"><Icon name="HistoryIcon" /></IconButton>`.',
  '- NEVER invent icon names from Material Symbols / Heroicons / Font Awesome (`help_outline`, `menu_book`, `support_agent`, etc.) — they will not resolve and will render as raw text.',
].join('\n');

// The spec model has `children: string[]` referencing OTHER spec elements
// by key — there is no way to nest a literal string under a parent. Without
// a `Text` primitive the LLM defaults to empty `<div />` placeholders
// inside Heading / Anchor / Card, leaving silent gaps in the preview.
const textUsageInstruction = [
  'Text content:',
  '- Use the `Text` component (`{ "type": "Text", "props": { "content": "..." } }`) for any literal text inside another component — Heading text, Anchor labels, Card body copy, list item text, etc.',
  '- Children are element keys, NOT raw strings — placing a string directly in `children` is invalid.',
  '- Components with a dedicated text prop (Button.label, Alert.message, Badge.text, FormControl.label, IconButton.label) take strings via THAT prop, not via `Text` children.',
  '- If a parent has nothing to say, omit the child entirely — do NOT insert an empty `<div />` placeholder.',
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

const systemPrompt = [
  adapter.catalog.prompt({ mode: 'standalone' }),
  '',
  'Library design principles:',
  adapter.metadata.designPrinciples,
  '',
  propsDisciplineInstruction,
  '',
  iconUsageInstruction,
  '',
  textUsageInstruction,
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
