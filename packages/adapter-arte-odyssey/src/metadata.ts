import type { AdapterMetadata } from '@decoro/adapter-spec';

/**
 * Library-specific "do this, not that" rules surfaced as `promptGuidance`.
 * Each entry exists because the LLM hallucinated something that wouldn't
 * compile or wouldn't render against ArteOdyssey:
 *   - `className` on Button/Card/etc. — they style themselves, the
 *     attribute would just be silently dropped at type-check time.
 *   - Material Symbols / Heroicons names — ArteOdyssey ships its own icon
 *     set; foreign names render as raw text in the preview.
 *   - Empty `<div />` placeholders for text — there is no "raw string
 *     child" in the spec model, you have to use the `Text` primitive.
 *
 * Universal Decoro guidance (response format, spec model rules,
 * mockup-first preference) lives in `apps/web/src/app/api/generate/route.ts`
 * and applies regardless of which adapter is bound.
 */
const promptGuidance = [
  'Prop discipline (ArteOdyssey-specific):',
  '- Do NOT add `className` to ArteOdyssey components (Button, Card, FormControl, TextField, etc.). They control their own styling.',
  '- `className` is allowed ONLY on layout HTML elements (div, section, header, main), and only with the allowlisted utility tokens shown in their schema.',
  '',
  'Icons (ArteOdyssey-specific):',
  '- Use the `Icon` component with its `name` prop set to one of the names in the catalog enum (e.g. `<Icon name="HistoryIcon" />`).',
  '- For icon-only actions, use `IconButton` with one `Icon` child: `<IconButton label="History"><Icon name="HistoryIcon" /></IconButton>`.',
  '- NEVER use Material Symbols / Heroicons / Font Awesome names (`help_outline`, `menu_book`, `support_agent`, etc.) — they will not resolve and will render as raw text.',
  '',
  'Text content (ArteOdyssey-specific):',
  '- Use the `Text` component (`{ "type": "Text", "props": { "content": "..." } }`) for any literal text inside another component — Heading text, Anchor labels, Card body copy, list item text, etc.',
  '- Components with a dedicated text prop (Button.label, Alert.message, Badge.text, FormControl.label, IconButton.label) take strings via THAT prop, not via `Text` children.',
].join('\n');

export const metadata: AdapterMetadata = {
  name: '@k8o/arte-odyssey',
  version: '7.0.1',
  designPrinciples: [
    'ArteOdyssey is a React + TypeScript + Tailwind CSS 4 design system.',
    'Prefer semantic, accessible components over div soup.',
    'Color: primary for the main call to action, secondary for supporting actions, gray for neutral / cancel.',
    'Variants: contained for prominence, outlined for secondary affordance, skeleton for ghost/inline use.',
    'Sizes: sm / md / lg. Default to md unless density demands otherwise.',
    'Spacing and rounded corners follow the library defaults — do not override with raw Tailwind unless asked.',
  ].join('\n'),
  promptGuidance,
};
