import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

import { generatedComponents } from './catalog.generated.ts';
import { isAllowedClassName } from './class-name-allowlist.ts';

const buttonProps = z.object({
  label: z.string().describe('Visible button text.'),
  type: z.enum(['button', 'submit']).nullable(),
  size: z.enum(['sm', 'md', 'lg']).nullable(),
  color: z.enum(['primary', 'secondary', 'gray']).nullable(),
  variant: z.enum(['contained', 'outlined', 'skeleton']).nullable(),
  fullWidth: z.boolean().nullable(),
  disabled: z.boolean().nullable(),
});

const cardProps = z.object({
  width: z.enum(['full', 'fit']).nullable(),
  appearance: z.enum(['shadow', 'bordered']).nullable(),
});

/**
 * Layout HTML element shape (per ADR-012). The only prop is `className`,
 * constrained at the Zod layer to a curated allowlist so the LLM cannot
 * break out of the design system.
 */
const layoutElementProps = z.object({
  className: z
    .string()
    .nullable()
    .refine((v) => v === null || isAllowedClassName(v), {
      message:
        'className must use only design-system-aligned utilities (display, flex/grid, gap-*, p-*, m-*, w-*, h-*, ArteOdyssey token-bound colors, rounded-*, etc.). Free-form Tailwind is rejected.',
    }),
});

const layoutDescription = (tag: string, semantics: string) =>
  [
    `Native <${tag}> element for layout / composition. ${semantics}`,
    '',
    'Set `className` to combine ArteOdyssey-token-aligned Tailwind utilities for layout: display (`flex`, `grid`), direction (`flex-col`, `flex-row`), alignment (`items-center`, `justify-between`), gap (`gap-4`), padding (`p-6`, `px-4`), sizing (`w-full`, `max-w-md`), token colors (`bg-bg-base`, `border-border-mute`), borders (`border`, `rounded-xl`).',
    '',
    'Free-form Tailwind (e.g. `bg-red-500`, `text-9xl`, `gap-[37px]`) is rejected — use only the curated allowlist.',
  ].join('\n');

export const catalog = defineCatalog(schema, {
  components: {
    // Generated entries first; hand-written below override on name conflict
    // (Button / Card / HTML elements ship bespoke shapes).
    ...generatedComponents,
    Button: {
      props: buttonProps,
      slots: [],
      description:
        'Standard ArteOdyssey button. Use for actions; the visible text comes from `label`. Pick `color` and `variant` based on prominence.',
    },
    Card: {
      props: cardProps,
      slots: ['default'],
      description:
        'Container for grouping content. Use `appearance: "bordered"` when stacking multiple cards on the same surface, otherwise leave the default shadow.',
    },
    div: {
      props: layoutElementProps,
      slots: ['default'],
      description: layoutDescription(
        'div',
        'Generic block container. Default for layout grouping when no semantic element fits.',
      ),
    },
    section: {
      props: layoutElementProps,
      slots: ['default'],
      description: layoutDescription(
        'section',
        'Use for thematic groupings of content (a hero section, a card grid, etc.).',
      ),
    },
    header: {
      props: layoutElementProps,
      slots: ['default'],
      description: layoutDescription(
        'header',
        'Use for the top of a page or a thematic block (titles, intro content, primary navigation row).',
      ),
    },
    main: {
      props: layoutElementProps,
      slots: ['default'],
      description: layoutDescription(
        'main',
        'The dominant content area of a page. There should be at most one per page.',
      ),
    },
  },
  actions: {},
});

export type ButtonProps = z.infer<typeof buttonProps>;
export type CardProps = z.infer<typeof cardProps>;
export type LayoutElementProps = z.infer<typeof layoutElementProps>;
