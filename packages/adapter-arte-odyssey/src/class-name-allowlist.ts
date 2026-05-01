/**
 * Curated subset of Tailwind utilities the LLM is allowed to put on a layout
 * HTML element (per ADR-012). Anything outside this set fails the Zod
 * refinement on `className`, so the model physically cannot emit
 * `bg-red-500`, `text-9xl`, `gap-[37px]`, or other off-design-system values.
 *
 * The set is intentionally narrow at first — composition (display, flex
 * direction, gap, alignment, sizing) plus token-bound colors. Grow it as
 * real demos surface needs; do **not** open it to arbitrary palette / size
 * utilities.
 *
 * Kept as a module-level Set so the Zod refine is O(tokens) per validation.
 */
const ALLOWED_CLASSES = new Set<string>([
  // Display
  'flex',
  'inline-flex',
  'grid',
  'block',
  'inline-block',
  'hidden',
  'relative',
  'absolute',
  'sticky',

  // Flex direction / wrap
  'flex-col',
  'flex-row',
  'flex-wrap',
  'flex-nowrap',

  // Alignment
  'items-start',
  'items-center',
  'items-end',
  'items-stretch',
  'items-baseline',
  'self-start',
  'self-center',
  'self-end',
  'self-stretch',

  // Justify
  'justify-start',
  'justify-center',
  'justify-end',
  'justify-between',
  'justify-around',
  'justify-evenly',

  // Gap
  'gap-0',
  'gap-1',
  'gap-2',
  'gap-3',
  'gap-4',
  'gap-5',
  'gap-6',
  'gap-8',
  'gap-10',
  'gap-12',

  // Padding (common scale)
  'p-0',
  'p-1',
  'p-2',
  'p-3',
  'p-4',
  'p-5',
  'p-6',
  'p-8',
  'p-10',
  'p-12',
  'px-1',
  'px-2',
  'px-3',
  'px-4',
  'px-5',
  'px-6',
  'px-8',
  'py-1',
  'py-2',
  'py-3',
  'py-4',
  'py-5',
  'py-6',
  'py-8',
  'pt-2',
  'pt-4',
  'pt-6',
  'pb-2',
  'pb-4',
  'pb-6',
  'pl-2',
  'pl-4',
  'pr-2',
  'pr-4',

  // Margin (common scale)
  'm-0',
  'm-auto',
  'm-1',
  'm-2',
  'm-3',
  'm-4',
  'm-6',
  'm-8',
  'mx-auto',
  'my-2',
  'my-4',
  'my-6',
  'mt-2',
  'mt-4',
  'mt-6',
  'mb-2',
  'mb-4',
  'mb-6',

  // Sizing
  'w-full',
  'w-fit',
  'w-auto',
  'w-1/2',
  'w-1/3',
  'w-2/3',
  'w-1/4',
  'w-3/4',
  'h-full',
  'h-fit',
  'h-auto',
  'h-dvh',
  'min-h-dvh',
  'min-h-0',
  'max-w-sm',
  'max-w-md',
  'max-w-lg',
  'max-w-xl',
  'max-w-2xl',

  // ArteOdyssey token-bound colors only (no raw palette)
  'bg-bg-base',
  'bg-bg-raised',
  'bg-bg-surface',
  'bg-bg-mute',
  'bg-bg-subtle',
  'text-fg-base',
  'text-fg-mute',
  'border-border-mute',
  'border-border-emphasize',
  'border-border-inverse',

  // Borders
  'border',
  'border-t',
  'border-b',
  'border-l',
  'border-r',
  'border-2',
  'rounded-sm',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-full',

  // Overflow
  'overflow-hidden',
  'overflow-auto',
  'overflow-y-auto',
  'overflow-x-auto',
]);

/**
 * True when every space-separated token in `value` is in the allowlist.
 * Empty / whitespace-only string is allowed.
 */
export const isAllowedClassName = (value: string): boolean => {
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.every((token) => ALLOWED_CLASSES.has(token));
};

/**
 * Read-only view of the allowlist, exported for tests and for the LLM-facing
 * description string in the catalog.
 */
export const allowedClasses = (): readonly string[] => [...ALLOWED_CLASSES];
