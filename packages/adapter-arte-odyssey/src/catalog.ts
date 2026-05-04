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

const alertProps = z.object({
  status: z.enum(['success', 'info', 'warning', 'error']),
  message: z.string(),
});

const formControlProps = z.object({
  label: z.string(),
  helpText: z.string().nullable(),
  errorText: z.string().nullable(),
  isDisabled: z.boolean().nullable(),
  isInvalid: z.boolean().nullable(),
  isRequired: z.boolean().nullable(),
});

const drawerProps = z.object({
  title: z.string(),
  isOpen: z.boolean().nullable(),
  side: z.enum(['left', 'right']).nullable(),
});

const modalProps = z.object({
  type: z.enum(['center', 'bottom', 'right', 'left']).nullable(),
  isOpen: z.boolean().nullable(),
});

const paginationProps = z.object({
  totalPages: z.number(),
  currentPage: z.number(),
  isDisabled: z.boolean().nullable(),
  prevLabel: z.string().nullable(),
  nextLabel: z.string().nullable(),
});

/**
 * The complete set of icon components ArteOdyssey ships from
 * `@k8o/arte-odyssey`. The catalog uses this enum so the LLM can only
 * pick names that actually resolve to a real export — without it the
 * model defaults to Material Symbols / Heroicons names (`help_outline`,
 * `menu_book`, etc.) because that's the dominant chatbot-UI training
 * data, and those render as raw text in the preview.
 *
 * Source of truth: ArteOdyssey's icons module
 * (`packages/arte-odyssey/src/components/icons/lucide.tsx`). When a new
 * icon ships there, append the name here and the registry / codegen
 * picks it up automatically.
 */
export const ICON_NAMES = [
  'AIIcon',
  'AccessibilityIcon',
  'AlertIcon',
  'AtomIcon',
  'BadIcon',
  'BlogIcon',
  'BoringIcon',
  'CheckIcon',
  'ChevronIcon',
  'CloseIcon',
  'ColorContrastIcon',
  'ColorInfoIcon',
  'CopyIcon',
  'DarkModeIcon',
  'DifficultIcon',
  'EasyIcon',
  'ExternalLinkIcon',
  'FormIcon',
  'GoodIcon',
  'HistoryIcon',
  'InformativeIcon',
  'InterestingIcon',
  'LightModeIcon',
  'LinkIcon',
  'ListIcon',
  'LocationIcon',
  'MailIcon',
  'MinusIcon',
  'MixedColorIcon',
  'NavigationMenuIcon',
  'NewsIcon',
  'PaletteIcon',
  'PlusIcon',
  'PrepareIcon',
  'PublishDateIcon',
  'RSSIcon',
  'SendIcon',
  'ShallowIcon',
  'ShieldCheckIcon',
  'SlideIcon',
  'SparklesIcon',
  'SubscribeIcon',
  'TableIcon',
  'TagIcon',
  'UpdateDateIcon',
  'ViewIcon',
  'ViewOffIcon',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const iconProps = z.object({
  name: z.enum(ICON_NAMES),
  size: z.enum(['sm', 'md', 'lg']).nullable(),
});

const iconButtonProps = z.object({
  label: z
    .string()
    .describe(
      'Tooltip / aria-label. Required — IconButton has no visible text, so the label is the only signal of intent for screen readers and on hover.',
    ),
  size: z.enum(['sm', 'md', 'lg']).nullable(),
  bg: z.enum(['transparent', 'base', 'primary', 'secondary']).nullable(),
});

/**
 * Catalog primitive for raw text content. The json-render spec model has
 * `children: string[]` referring to OTHER spec elements by key — there is
 * no way to nest a literal string under a parent. Without a `Text`
 * primitive the LLM either fakes it with an empty `<div />` placeholder
 * (visible in dogfood as silent gaps inside Heading / Card body / Anchor)
 * or skips the content entirely.
 *
 * Codegen emits `Text` as a JSX expression with a JS string literal —
 * `{"サインイン"}` — so JSX-significant characters (`<`, `>`, `&`, quotes)
 * survive the round-trip into the user's codebase.
 */
const textProps = z.object({
  content: z
    .string()
    .describe(
      'The text to render at this position. Use this whenever you need raw text content inside another component (Heading, Anchor, Card body, etc.) — children are otherwise references to other spec elements.',
    ),
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
    Alert: {
      props: alertProps,
      slots: [],
      description:
        'Status alert. Pick `status` by intent: "error" for failures, "warning" for cautions, "info" for informational notices, "success" for confirmations. `message` is a single short string.',
    },
    FormControl: {
      props: formControlProps,
      slots: ['default'],
      description:
        'Labelled wrapper around a single form input. Put exactly one input child (TextField, PasswordInput, NumberField, Select, Textarea, Checkbox, Radio, etc.) inside. Use `helpText` for hints and `errorText` for validation messages.',
    },
    Drawer: {
      props: drawerProps,
      slots: ['default'],
      description:
        'Side-attached overlay panel. `side="right"` (default) for help / settings panes, `side="left"` for navigation drawers. `isOpen` defaults to true so the preview shows the rendered state; the generated TSX wires it into your own state.',
    },
    Modal: {
      props: modalProps,
      slots: ['default'],
      description:
        'Centered (default) or edge-attached dialog. Pick `type` based on the experience: "center" for confirmations, "bottom" for sheet-style action menus, "right"/"left" for slide-overs. `isOpen` defaults to true so the preview shows the rendered state.',
    },
    Pagination: {
      props: paginationProps,
      slots: [],
      description:
        'Pagination control with prev / next buttons. `totalPages` and `currentPage` are required (1-based). `prevLabel` / `nextLabel` default to Japanese labels in ArteOdyssey; override for English UIs.',
    },
    Icon: {
      props: iconProps,
      slots: [],
      description:
        'ArteOdyssey icon. Set `name` to one of the listed icons — these are the ONLY available icons. NEVER use Material Symbols / Heroicons / Font Awesome names (`help_outline`, `menu_book`, etc.); they will not resolve and render as raw text.',
    },
    Text: {
      props: textProps,
      slots: [],
      description:
        'Raw text content. Use this whenever you need a literal string inside another component (Heading title, Anchor label, Card body copy, list item text, etc.). Without `Text`, children would just be element keys — there is no other way to express text content.',
    },
    IconButton: {
      props: iconButtonProps,
      slots: ['default'],
      description:
        'Icon-only button with a tooltip / aria-label. Place exactly one `<Icon name="..." />` child for the visible glyph; `label` is the tooltip text and accessible name. The catalog `IconButton` from the auto-generated set above is overridden here — only this shape is correct.',
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
export type AlertProps = z.infer<typeof alertProps>;
export type FormControlProps = z.infer<typeof formControlProps>;
export type DrawerProps = z.infer<typeof drawerProps>;
export type ModalProps = z.infer<typeof modalProps>;
export type PaginationProps = z.infer<typeof paginationProps>;
export type IconProps = z.infer<typeof iconProps>;
export type IconButtonProps = z.infer<typeof iconButtonProps>;
export type TextProps = z.infer<typeof textProps>;
