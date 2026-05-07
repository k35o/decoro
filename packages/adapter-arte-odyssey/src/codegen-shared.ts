import { serializeProps } from '@json-render/codegen';
import type { UIElement } from '@json-render/core';

import { ICON_NAMES } from './catalog.ts';

export const indentUnit = '  ';
export const pad = (depth: number) => indentUnit.repeat(depth);

export const stripNullish = (props: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== null && v !== undefined),
  );

/**
 * Props on ArteOdyssey components whose catalog type is `string` but
 * which actually take an icon JSX element at runtime
 * (`startIcon={<HistoryIcon />}`). The catalog can't model "this string
 * is an icon component name" without polluting the AI prompt with a
 * non-runtime concept; instead we keep the catalog typed as `string`
 * and intercept these prop names at codegen time, swapping the
 * serialised `prop="Name"` for `prop={<Name />}` and registering the
 * icon component in the import list.
 *
 * Limited to the pair `startIcon` / `endIcon` because those are the
 * only props on the current ArteOdyssey surface that follow this
 * pattern. Add more if a future component grows another icon-shaped
 * prop.
 */
const ICON_NAME_PROPS: ReadonlySet<string> = new Set(['startIcon', 'endIcon']);

const ICON_NAME_SET: ReadonlySet<string> = new Set(ICON_NAMES);

const splitIconProps = (
  props: Record<string, unknown>,
): {
  serialisable: Record<string, unknown>;
  icons: Array<{ propName: string; iconName: string }>;
} => {
  const serialisable: Record<string, unknown> = {};
  const icons: Array<{ propName: string; iconName: string }> = [];
  for (const [key, value] of Object.entries(props)) {
    if (
      ICON_NAME_PROPS.has(key) &&
      typeof value === 'string' &&
      ICON_NAME_SET.has(value)
    ) {
      icons.push({ propName: key, iconName: value });
      continue;
    }
    serialisable[key] = value;
  }
  return { serialisable, icons };
};

const renderProps = (element: UIElement, extras: FormatterExtras): string => {
  const { serialisable, icons } = splitIconProps(stripNullish(element.props));
  const baseAttrs = serializeProps(serialisable, { quotes: 'double' });
  if (icons.length === 0) return baseAttrs;
  for (const { iconName } of icons) extras.addImport(iconName);
  const iconAttrs = icons
    .map(({ propName, iconName }) => `${propName}={<${iconName} />}`)
    .join(' ');
  return baseAttrs ? `${baseAttrs} ${iconAttrs}` : iconAttrs;
};

/**
 * `extras.addImport(name)` lets a formatter pull in an additional named
 * export from `@k8o/arte-odyssey` beyond the element's own type. Used by
 * the Icon formatter to emit `<HistoryIcon />` (the icon component) while
 * the catalog type stays as the meta `Icon`.
 */
export type FormatterExtras = {
  addImport: (name: string) => void;
};

export type Formatter = (
  element: UIElement,
  renderedChildren: string[],
  depth: number,
  extras: FormatterExtras,
) => string;

/**
 * Default formatter shape for an ArteOdyssey component: serialise every
 * non-nullish prop as a JSX attribute, then either self-close, or wrap the
 * already-rendered children. Used by `code-output.generated.ts` for every
 * component the F1 generator picks up.
 *
 * Icon-shaped props (`startIcon` / `endIcon`) are special-cased — the
 * catalog types them as `string` so the AI can pick an icon name from
 * the catalog enum, but at codegen time we promote the string into a
 * `{<IconName />}` JSX expression and register the icon as an import.
 * Without this the generated TSX has `startIcon="HistoryIcon"` which
 * fails at type-check (the prop expects ReactNode, not string).
 */
export const passthroughFormatter =
  (tag: string): Formatter =>
  (element, renderedChildren, depth, extras) => {
    const propsAttrs = renderProps(element, extras);
    if (renderedChildren.length === 0) {
      return propsAttrs
        ? `${pad(depth)}<${tag} ${propsAttrs} />`
        : `${pad(depth)}<${tag} />`;
    }
    const open = propsAttrs ? `<${tag} ${propsAttrs}>` : `<${tag}>`;
    return [
      `${pad(depth)}${open}`,
      ...renderedChildren,
      `${pad(depth)}</${tag}>`,
    ].join('\n');
  };
