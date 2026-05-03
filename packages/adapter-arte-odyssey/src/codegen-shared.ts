import { serializeProps } from '@json-render/codegen';
import type { UIElement } from '@json-render/core';

export const indentUnit = '  ';
export const pad = (depth: number) => indentUnit.repeat(depth);

export const stripNullish = (props: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== null && v !== undefined),
  );

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
 */
export const passthroughFormatter =
  (tag: string): Formatter =>
  (element, renderedChildren, depth, _extras) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
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
