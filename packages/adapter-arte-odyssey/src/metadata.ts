import type { AdapterMetadata } from '@decoro/adapter-spec';

/**
 * ArteOdyssey-specific "do this, not that" rules surfaced as `promptGuidance`.
 *
 * arte-odyssey's first-party catalog (`@k8o/arte-odyssey/json-render`) already
 * carries per-component descriptions and enum constraints, and
 * `catalog.prompt()` documents every prop — so this stays short and only
 * reinforces the few cross-cutting conventions the LLM tends to trip on for
 * this library.
 */
const promptGuidance = [
  'Layout (ArteOdyssey-specific):',
  '- Compose layout with `Stack` (direction / gap) and `Grid`. There are NO raw HTML layout elements (div/section/…) and NO `className` prop — do not invent them.',
  '',
  'Text (ArteOdyssey-specific):',
  "- Put copy in each component's own text prop (e.g. `Button.label`, `Alert.message`, `Tooltip.text`, `Code.code`, tab / table cell strings). `children` are references to other catalog elements, never raw strings.",
  '',
  'Icons (ArteOdyssey-specific):',
  '- Use `Icon` / `StatusIcon` / `ChevronIcon` with a name / value drawn ONLY from the catalog enums. NEVER use Material Symbols / Heroicons / Font Awesome names — they will not resolve and render as raw text.',
].join('\n');

export const metadata: AdapterMetadata = {
  name: '@k8o/arte-odyssey',
  displayName: 'ArteOdyssey',
  version: '10.0.0',
  designPrinciples: [
    'ArteOdyssey is a React + TypeScript + Tailwind CSS 4 design system.',
    'Prefer semantic, accessible components over raw markup; compose layout with Stack and Grid.',
    'Use the primary color / tone for the main call to action, secondary for supporting actions, and the neutral tone for cancel / low-emphasis actions.',
    'Default to medium sizing and the library default spacing / rounding unless the design calls for otherwise.',
  ].join('\n'),
  promptGuidance,
};
