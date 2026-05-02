import type { AdapterCodeOutput } from '@decoro/adapter-spec';
import { serializeProps } from '@json-render/codegen';
import type { Spec, UIElement } from '@json-render/core';
import type { z } from 'zod';

import { catalog } from './catalog.ts';
import {
  GENERATED_IMPORT_TAGS,
  generatedFormatters,
} from './code-output.generated.ts';
import { type Formatter, pad, stripNullish } from './codegen-shared.ts';

const importPath = '@k8o/arte-odyssey';

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
  // Generated formatters first; hand-written below override on name conflict.
  ...generatedFormatters,
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
  Alert: (element, _children, depth) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
    return propsAttrs
      ? `${pad(depth)}<Alert ${propsAttrs} />`
      : `${pad(depth)}<Alert />`;
  },
  FormControl: (element, renderedChildren, depth) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
    if (renderedChildren.length === 0) {
      return `${pad(depth)}<FormControl ${propsAttrs} renderInput={() => null} />`;
    }
    // Wrap rendered children inside a `renderInput={() => (...)}` callback so
    // the emitted TSX matches ArteOdyssey's actual API. Each child line gets
    // an extra indent level to nest correctly under the callback body.
    const reIndented = renderedChildren.map((line) =>
      line.replace(/^( *)/, (m) => m.concat(pad(2))),
    );
    return [
      `${pad(depth)}<FormControl`,
      `${pad(depth + 1)}${propsAttrs}`,
      `${pad(depth + 1)}renderInput={() => (`,
      ...reIndented,
      `${pad(depth + 1)})}`,
      `${pad(depth)}/>`,
    ].join('\n');
  },
  Drawer: (element, renderedChildren, depth) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
    return [
      `${pad(depth)}<Drawer`,
      `${pad(depth + 1)}${propsAttrs}`,
      `${pad(depth + 1)}// TODO: wire onClose to your own dismissal state`,
      `${pad(depth + 1)}onClose={() => {}}`,
      `${pad(depth)}>`,
      ...renderedChildren,
      `${pad(depth)}</Drawer>`,
    ].join('\n');
  },
  Modal: (element, renderedChildren, depth) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
    const opener = propsAttrs ? `<Modal ${propsAttrs}` : '<Modal';
    return [
      `${pad(depth)}${opener}`,
      `${pad(depth + 1)}// TODO: wire onClose to your own dismissal state`,
      `${pad(depth + 1)}onClose={() => {}}`,
      `${pad(depth)}>`,
      ...renderedChildren,
      `${pad(depth)}</Modal>`,
    ].join('\n');
  },
  Pagination: (element, _children, depth) => {
    const propsAttrs = serializeProps(stripNullish(element.props), {
      quotes: 'double',
    });
    return [
      `${pad(depth)}<Pagination`,
      `${pad(depth + 1)}${propsAttrs}`,
      `${pad(depth + 1)}// TODO: wire onPageChange to your routing / data fetch`,
      `${pad(depth + 1)}onPageChange={(_page) => {}}`,
      `${pad(depth)}/>`,
    ].join('\n');
  },
  div: layoutElementFormatter('div'),
  section: layoutElementFormatter('section'),
  header: layoutElementFormatter('header'),
  main: layoutElementFormatter('main'),
};

const MAX_DEPTH = 64;

/**
 * Strip props that the catalog's Zod schema for this component does not
 * declare. Zod `safeParse` defaults to dropping unknown keys, so a
 * successful parse returns the same shape minus anything the LLM hallucinated
 * (e.g. `className` on `<Card>`, which ArteOdyssey's Card does not accept —
 * pasting that into a real codebase fails to compile).
 *
 * Falls back to the original props on parse failure so a single bad value
 * doesn't break codegen for the rest of the spec — the user still gets
 * something to work with even if a prop is malformed.
 */
const catalogComponents = (
  catalog.data as { components: Record<string, { props: z.ZodType }> }
).components;

const sanitizeProps = (
  type: string,
  props: Record<string, unknown>,
): Record<string, unknown> => {
  const schema = catalogComponents[type]?.props;
  if (!schema) return props;
  const result = schema.safeParse(props);
  return result.success ? (result.data as Record<string, unknown>) : props;
};

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
  const sanitized: UIElement = {
    ...element,
    props: sanitizeProps(element.type, element.props),
  };
  return formatter(sanitized, children, depth);
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
  // appear in the import line. Hand-written tags (Button, Card) and the
  // generated set are both real exports of `@k8o/arte-odyssey`.
  const componentImports = [...usedTypes]
    .filter((t) => !HTML_TAGS.has(t))
    .toSorted();
  void GENERATED_IMPORT_TAGS;
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
