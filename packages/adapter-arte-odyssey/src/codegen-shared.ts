import { serializeProps } from '@json-render/codegen';
import type { UIElement } from '@json-render/core';

export const indentUnit = '  ';
export const pad = (depth: number) => indentUnit.repeat(depth);

export const stripNullish = (props: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== null && v !== undefined),
  );

export type Formatter = (
  element: UIElement,
  renderedChildren: string[],
  depth: number,
) => string;

/**
 * Default formatter shape for an ArteOdyssey component: serialise every
 * non-nullish prop as a JSX attribute, then either self-close, or wrap the
 * already-rendered children. Used by `code-output.generated.ts` for every
 * component the F1 generator picks up.
 */
export const passthroughFormatter =
  (tag: string): Formatter =>
  (element, renderedChildren, depth) => {
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
