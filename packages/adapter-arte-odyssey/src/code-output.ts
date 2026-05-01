import type { AdapterCodeOutput } from '@decoro/adapter-spec';
import { collectUsedComponents, serializeProps } from '@json-render/codegen';
import type { Spec, UIElement } from '@json-render/core';

const importPath = '@k8o/arte-odyssey';

const indentUnit = '  ';
const pad = (depth: number) => indentUnit.repeat(depth);

const stripNullish = (props: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== null && v !== undefined),
  );

type Formatter = (
  element: UIElement,
  renderedChildren: string[],
  depth: number,
) => string;

/**
 * Per-component formatters. Each one knows the gap between the AI-facing
 * Catalog shape (e.g. Button taking `label` as a prop) and the real
 * ArteOdyssey component shape (Button taking children).
 *
 * When new components are added to the Catalog, add a matching formatter
 * here — the codegen explicitly fails for unknown component types so the gap
 * cannot be silently glossed over.
 */
const formatters: Record<string, Formatter> = {
  Button: (element, _children, depth) => {
    const { label, ...rest } = element.props as {
      label?: unknown;
    } & Record<string, unknown>;
    const propsAttrs = serializeProps(stripNullish(rest), { quotes: 'double' });
    const open = propsAttrs ? `<Button ${propsAttrs}>` : '<Button>';
    const labelText = typeof label === 'string' ? label : '';
    return `${pad(depth)}${open}${labelText}</Button>`;
  },
  Card: (element, renderedChildren, depth) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
    if (renderedChildren.length === 0) {
      return propsAttrs
        ? `${pad(depth)}<Card ${propsAttrs} />`
        : `${pad(depth)}<Card />`;
    }
    const open = propsAttrs ? `<Card ${propsAttrs}>` : '<Card>';
    return [
      `${pad(depth)}${open}`,
      ...renderedChildren,
      `${pad(depth)}</Card>`,
    ].join('\n');
  },
};

const renderElement = (spec: Spec, key: string, depth: number): string => {
  const element = spec.elements[key];
  if (!element) return '';
  const formatter = formatters[element.type];
  if (!formatter) {
    throw new Error(
      `adapter-arte-odyssey codegen: missing formatter for "${element.type}". Add an entry to formatters in code-output.ts.`,
    );
  }
  const children = (element.children ?? [])
    .map((childKey) => renderElement(spec, childKey, depth + 1))
    .filter((s) => s !== '');
  return formatter(element, children, depth);
};

const generate = (spec: Spec): string => {
  if (spec.root === '' || !spec.elements[spec.root]) return '';
  const used = [...collectUsedComponents(spec)].toSorted();
  if (used.length === 0) return '';
  const importLine = `import { ${used.join(', ')} } from '${importPath}';`;
  const body = renderElement(spec, spec.root, 1);
  return [
    importLine,
    '',
    'export const GeneratedComponent = () => (',
    body,
    ');',
    '',
  ].join('\n');
};

export const codeOutput: AdapterCodeOutput = {
  importPath,
  generate,
};
