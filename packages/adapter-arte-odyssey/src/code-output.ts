import type { AdapterCodeOutput } from '@decoro/adapter-spec';
import { serializeProps } from '@json-render/codegen';
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
 * Native HTML element types (per ADR-012). Anything in this set is emitted
 * verbatim as a lowercase tag and never appears in the import line.
 */
const HTML_TAGS = new Set(['div', 'section', 'header', 'main']);

/**
 * Factory for ADR-012 layout HTML element formatters. The Zod refinement on
 * `className` runs upstream, so by the time we land here the value is
 * guaranteed to be either `null` or a safe, allowlist-checked utility string
 * (no quotes, no JSX-significant characters); we can interpolate it into a
 * `className="…"` attribute without further escaping.
 */
const layoutElementFormatter =
  (tag: string): Formatter =>
  (element, renderedChildren, depth) => {
    const { className } = element.props as { className?: unknown };
    const classNameAttr =
      typeof className === 'string' && className.length > 0
        ? ` className="${className}"`
        : '';
    if (renderedChildren.length === 0) {
      return `${pad(depth)}<${tag}${classNameAttr} />`;
    }
    return [
      `${pad(depth)}<${tag}${classNameAttr}>`,
      ...renderedChildren,
      `${pad(depth)}</${tag}>`,
    ].join('\n');
  };

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
    // Wrap the label in a JSX expression containing a JS string literal so
    // labels with JSX-significant characters (`<`, `>`, `&`, `{`, `}`,
    // quotes) emit valid TSX. React escapes these in the preview path, but
    // the textual output that ends up in the user's codebase has to be safe
    // on its own. JSON.stringify is the simplest canonical "JS string
    // literal" formatter.
    const labelText = typeof label === 'string' ? label : '';
    return `${pad(depth)}${open}{${JSON.stringify(labelText)}}</Button>`;
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
  div: layoutElementFormatter('div'),
  section: layoutElementFormatter('section'),
  header: layoutElementFormatter('header'),
  main: layoutElementFormatter('main'),
};

const MAX_DEPTH = 64;

const renderElement = (
  spec: Spec,
  key: string,
  depth: number,
  visiting: Set<string>,
  usedTypes: Set<string>,
): string => {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `adapter-arte-odyssey codegen: spec exceeds max depth ${MAX_DEPTH.toString()}.`,
    );
  }
  if (visiting.has(key)) {
    throw new Error(
      `adapter-arte-odyssey codegen: cycle detected at element "${key}".`,
    );
  }
  const element = spec.elements[key];
  if (!element) return '';
  const formatter = formatters[element.type];
  if (!formatter) {
    throw new Error(
      `adapter-arte-odyssey codegen: missing formatter for "${element.type}". Add an entry to formatters in code-output.ts.`,
    );
  }
  usedTypes.add(element.type);
  visiting.add(key);
  const children = (element.children ?? [])
    .map((childKey) =>
      renderElement(spec, childKey, depth + 1, visiting, usedTypes),
    )
    .filter((s) => s !== '');
  visiting.delete(key);
  return formatter(element, children, depth);
};

const generate = (spec: Spec): string => {
  if (spec.root === '' || !spec.elements[spec.root]) return '';
  // Collect types during the same depth-first walk that emits the JSX so
  // cycles get caught here instead of inside json-render's helper, which
  // does its own walk without cycle protection.
  const usedTypes = new Set<string>();
  const body = renderElement(spec, spec.root, 1, new Set<string>(), usedTypes);
  if (usedTypes.size === 0) return '';
  // Native HTML tags (ADR-012) need no import; only ArteOdyssey components
  // appear in the import line.
  const componentImports = [...usedTypes]
    .filter((t) => !HTML_TAGS.has(t))
    .toSorted();
  const lines: string[] = [];
  if (componentImports.length > 0) {
    lines.push(
      `import { ${componentImports.join(', ')} } from '${importPath}';`,
      '',
    );
  }
  lines.push('export const GeneratedComponent = () => (', body, ');', '');
  return lines.join('\n');
};

export const codeOutput: AdapterCodeOutput = {
  importPath,
  generate,
};
