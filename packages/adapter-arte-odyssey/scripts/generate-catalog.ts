/**
 * F1: read a `decoro-catalog.json` (the artifact F2 publishes — see
 * docs/decisions.md ADR-011 and issues #24, #25) and emit three sibling
 * files under `src/`:
 *
 *   - catalog.generated.ts   — `generatedComponents` Record for json-render
 *                              `defineCatalog`.
 *   - registry.generated.tsx — `generatedRegistry` mapping each name to a
 *                              passthrough renderer over the matching
 *                              ArteOdyssey component.
 *   - code-output.generated.ts — `generatedFormatters` for the codegen
 *                                lowering, one entry per generated component.
 *
 * Hand-written `catalog.ts` / `registry.tsx` / `code-output.ts` spread the
 * generated maps and override per name so Button / Card / HTML elements keep
 * their bespoke shapes.
 *
 * Source selection: by default reads
 * `packages/adapter-arte-odyssey/test-fixtures/decoro-catalog.example.json`
 * (the F2 prototype output committed alongside this script). Pass
 * `--from <path-or-url>` to point at a real Chromatic-hosted JSON later.
 *
 * Run: `pnpm --filter @decoro/adapter-arte-odyssey generate:catalog`
 */
/* oxlint-disable eslint(no-console) typescript/no-unsafe-assignment typescript/no-unsafe-call typescript/no-unsafe-member-access typescript/no-non-null-assertion */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import { z } from 'zod';

const here = import.meta.dirname;
const packageRoot = resolve(here, '..');
const srcDir = join(packageRoot, 'src');

const propTypeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('enum'), values: z.array(z.string()) }),
  z.object({ kind: z.literal('string') }),
  z.object({ kind: z.literal('number') }),
  z.object({ kind: z.literal('boolean') }),
  z.object({ kind: z.literal('union'), raw: z.string() }),
  z.object({ kind: z.literal('unknown'), raw: z.string() }),
]);

const propEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  type: propTypeSchema,
});

const exampleSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
});

const componentSchema = z.object({
  name: z.string(),
  importPath: z.string(),
  description: z.string(),
  sourcePath: z.string().optional(),
  props: z.array(propEntrySchema),
  examples: z.array(exampleSchema),
});

const catalogJsonSchema = z.object({
  schemaVersion: z.literal(1),
  library: z.object({ name: z.string(), version: z.string() }),
  components: z.array(componentSchema),
});

type CatalogJson = z.infer<typeof catalogJsonSchema>;
type ComponentJson = z.infer<typeof componentSchema>;
type PropJson = z.infer<typeof propEntrySchema>;

/**
 * Components handled by hand. The generator skips them so `catalog.ts`,
 * `registry.tsx`, and `code-output.ts` can keep emitting their bespoke
 * versions:
 *
 * - Button: `label`-prop → JSX-children lowering.
 * - Card: tight enum surface (shadow/bordered) + slot.
 * - Alert: `message: string | string[]` shape that does not lower cleanly.
 * - FormControl: `renderInput` is a render-prop that needs slot composition.
 * - Drawer / Modal: required `onClose` callback; needs json-render `actions`
 *   wiring and a no-op default for the preview path.
 * - Pagination: required `onPageChange` callback; same as Drawer.
 *
 * Add to this set whenever a generated entry needs a hand override.
 */
const HAND_OVERRIDDEN_COMPONENTS = new Set([
  'Button',
  'Card',
  'Alert',
  'FormControl',
  'Drawer',
  'Modal',
  'Pagination',
]);

type CliFlags = { from: string };

const parseFlags = (args: string[]): CliFlags => {
  const flags: CliFlags = {
    from: join(packageRoot, 'test-fixtures/decoro-catalog.example.json'),
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--from') {
      flags.from = args[++i] ?? flags.from;
    }
  }
  return flags;
};

const readCatalog = async (from: string): Promise<CatalogJson> => {
  const raw =
    from.startsWith('http://') || from.startsWith('https://')
      ? await fetch(from).then((r) => r.text())
      : existsSync(from)
        ? readFileSync(from, 'utf8')
        : (() => {
            console.error(`[fatal] not a file or URL: ${from}`);
            exit(1);
          })();
  const parsed = catalogJsonSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error(
      `[fatal] catalog JSON failed validation: ${parsed.error.message}`,
    );
    exit(1);
  }
  return parsed.data;
};

/**
 * Reclassify the raw type string into a Zod-emittable shape that the
 * F2-prototype classifier missed. The prototype's `classifyType` only handles
 * literal-string unions, so legitimate cases (`string | undefined`, well-known
 * `Option[]` arrays, plain `string[]`, ReactNode-as-text, callbacks) all
 * arrive here flagged `union` or `unknown`. We squeeze out everything we can
 * without going back to react-docgen-typescript.
 */
type ResolvedKind =
  | { kind: 'enum'; values: string[]; nullable: boolean }
  | { kind: 'string'; nullable: boolean }
  | { kind: 'number'; nullable: boolean }
  | { kind: 'boolean'; nullable: boolean }
  | { kind: 'string-array'; nullable: boolean }
  | { kind: 'option-array'; nullable: boolean }
  | { kind: 'string-or-string-array' }
  | { kind: 'callback' }
  | null;

const reclassifyRaw = (raw: string): ResolvedKind => {
  const s = raw.trim();
  // T | undefined  /  undefined | T → nullable T
  const undefMatch =
    s.match(/^(.+?)\s*\|\s*undefined$/) ?? s.match(/^undefined\s*\|\s*(.+)$/);
  if (undefMatch) {
    const inner = reclassifyRaw(undefMatch[1]);
    if (inner !== null && 'nullable' in inner) {
      return { ...inner, nullable: true };
    }
  }
  // Plain `string` / `number` / `boolean` (rare but possible passthrough).
  if (s === 'string') return { kind: 'string', nullable: false };
  if (s === 'number') return { kind: 'number', nullable: false };
  if (s === 'boolean') return { kind: 'boolean', nullable: false };
  // ReactNode → AI fills as text. Runtime tolerates strings.
  if (s === 'ReactNode') return { kind: 'string', nullable: false };
  // string[] / readonly string[] → array of string
  if (s === 'string[]' || s === 'readonly string[]')
    return { kind: 'string-array', nullable: false };
  // ArteOdyssey's Option type. react-docgen prints it inlined.
  if (
    /^readonly\s+Option\[\]$/.test(s) ||
    /^Option\[\]$/.test(s) ||
    /Readonly<\{\s*value:\s*string;\s*label:\s*string\s*[;}]/i.test(s)
  ) {
    return { kind: 'option-array', nullable: false };
  }
  // Alert.message variant
  if (s === 'string | string[]') return { kind: 'string-or-string-array' };
  // Function / event handler types
  if (/^\(.*\)\s*=>/.test(s) || /Handler<[^>]+>/.test(s)) {
    return { kind: 'callback' };
  }
  return null;
};

const resolveProp = (p: PropJson): ResolvedKind => {
  if (p.type.kind === 'enum') {
    return { kind: 'enum', values: p.type.values, nullable: !p.required };
  }
  if (
    p.type.kind === 'string' ||
    p.type.kind === 'number' ||
    p.type.kind === 'boolean'
  ) {
    return { kind: p.type.kind, nullable: !p.required };
  }
  return reclassifyRaw(p.type.raw);
};

const isMappableProp = (p: PropJson): boolean => {
  const r = resolveProp(p);
  if (r === null) return false;
  return r.kind !== 'callback';
};

/**
 * A component is generatable if its required props all resolve to a
 * Zod-emittable kind. Optional unmappable props (e.g. callback handlers)
 * are silently dropped — the design system component will use its own
 * default.
 */
const isGeneratable = (c: ComponentJson): boolean => {
  if (HAND_OVERRIDDEN_COMPONENTS.has(c.name)) return false;
  for (const prop of c.props) {
    if (prop.required) {
      const r = resolveProp(prop);
      if (r === null || r.kind === 'callback') return false;
    }
  }
  return true;
};

const nullableSuffix = (nullable: boolean) => (nullable ? '.nullable()' : '');

const propToZodSrc = (p: PropJson): string | null => {
  const r = resolveProp(p);
  if (r === null || r.kind === 'callback') return null;
  switch (r.kind) {
    case 'enum':
      return `z.enum(${JSON.stringify(r.values)})${nullableSuffix(r.nullable)}`;
    case 'string':
    case 'number':
    case 'boolean':
      return `z.${r.kind}()${nullableSuffix(r.nullable)}`;
    case 'string-array':
      return `z.array(z.string())${nullableSuffix(r.nullable)}`;
    case 'option-array':
      return `z.array(z.object({ value: z.string(), label: z.string() }))${nullableSuffix(r.nullable)}`;
    case 'string-or-string-array':
      return 'z.union([z.string(), z.array(z.string())])';
    default: {
      const exhaustive: never = r;
      throw new Error(`unreachable: ${JSON.stringify(exhaustive)}`);
    }
  }
};

const escape = (s: string) => JSON.stringify(s);

const generateCatalogFile = (catalog: CatalogJson): string => {
  const components = catalog.components.filter(isGeneratable);
  const entries = components.map((c) => {
    const propLines = c.props
      .map((p) => {
        const src = propToZodSrc(p);
        return src === null ? null : `      ${p.name}: ${src},`;
      })
      .filter((line): line is string => line !== null);
    const propsBody =
      propLines.length > 0
        ? `z.object({\n${propLines.join('\n')}\n    })`
        : 'z.object({})';
    const description =
      c.description.trim().length > 0
        ? c.description.trim()
        : `${c.name} component from @k8o/arte-odyssey.`;
    // json-render's Catalog field is singular `example` (any), used as the
    // representative example threaded into the prompt. Pick the first story
    // when one exists.
    const exampleLine =
      c.examples.length > 0
        ? `\n    example: ${JSON.stringify(c.examples[0].args)},`
        : '';
    return `  ${c.name}: {
    props: ${propsBody},
    slots: ['default'],
    description: ${escape(description)},${exampleLine}
  },`;
  });

  return `// AUTO-GENERATED by scripts/generate-catalog.ts. Do not edit by hand.
// Source: ${catalog.library.name}@${catalog.library.version}
// Regenerate with: pnpm --filter @decoro/adapter-arte-odyssey generate:catalog

import { z } from 'zod';

export const generatedComponents = {
${entries.join('\n')}
};

export const GENERATED_COMPONENT_NAMES: readonly string[] = [
${components.map((c) => `  ${escape(c.name)},`).join('\n')}
];
`;
};

const generateRegistryFile = (catalog: CatalogJson): string => {
  const components = catalog.components.filter(isGeneratable);
  const importNames = components.map((c) => c.name).toSorted();
  return `// AUTO-GENERATED by scripts/generate-catalog.ts. Do not edit by hand.
// Source: ${catalog.library.name}@${catalog.library.version}

import type {
  ComponentRegistry,
  ComponentRenderProps,
} from '@json-render/react';
import { type ComponentType, createElement } from 'react';

import {
${importNames.map((n) => `  ${n},`).join('\n')}
} from '@k8o/arte-odyssey';

const passthrough = (
  Component: ComponentType<Record<string, unknown>>,
  displayName: string,
) => {
  const renderer = ({
    element,
    children,
  }: ComponentRenderProps<Record<string, unknown>>) => {
    // The catalog Zod schema enforces value safety upstream; runtime tolerance
    // for extra/missing props is the design system component's contract.
    return createElement(
      Component,
      element.props as Record<string, unknown>,
      children,
    );
  };
  renderer.displayName = displayName.concat('Renderer');
  return renderer;
};

export const generatedRegistry: ComponentRegistry = {
${importNames
  .map(
    (n) =>
      `  ${n}: passthrough(${n} as unknown as ComponentType<Record<string, unknown>>, ${JSON.stringify(n)}),`,
  )
  .join('\n')}
};
`;
};

const generateCodeOutputFile = (catalog: CatalogJson): string => {
  const components = catalog.components.filter(isGeneratable);
  return `// AUTO-GENERATED by scripts/generate-catalog.ts. Do not edit by hand.
// Source: ${catalog.library.name}@${catalog.library.version}

import { type Formatter, passthroughFormatter } from './codegen-shared.ts';

export const generatedFormatters: Record<string, Formatter> = {
${components.map((c) => `  ${c.name}: passthroughFormatter(${escape(c.name)}),`).join('\n')}
};

export const GENERATED_IMPORT_TAGS: readonly string[] = [
${components.map((c) => `  ${escape(c.name)},`).join('\n')}
];
`;
};

const main = async () => {
  const flags = parseFlags(argv.slice(2));
  console.log(`[info] reading: ${flags.from}`);

  const catalog = await readCatalog(flags.from);
  const generatable = catalog.components.filter(isGeneratable);
  const skipped = catalog.components.filter((c) => !isGeneratable(c));

  console.log(
    `[info] ${catalog.components.length} components in source; ${generatable.length} generatable, ${skipped.length} skipped`,
  );
  if (skipped.length > 0) {
    for (const c of skipped) {
      const reason = HAND_OVERRIDDEN_COMPONENTS.has(c.name)
        ? 'hand-overridden'
        : `requires unmappable prop(s): ${c.props
            .filter((p) => p.required && !isMappableProp(p))
            .map((p) => p.name)
            .join(', ')}`;
      console.log(`[skip] ${c.name} — ${reason}`);
    }
  }

  const writes: ReadonlyArray<{ path: string; content: string }> = [
    {
      path: join(srcDir, 'catalog.generated.ts'),
      content: generateCatalogFile(catalog),
    },
    {
      path: join(srcDir, 'registry.generated.tsx'),
      content: generateRegistryFile(catalog),
    },
    {
      path: join(srcDir, 'code-output.generated.ts'),
      content: generateCodeOutputFile(catalog),
    },
  ];

  for (const w of writes) {
    writeFileSync(w.path, w.content);
    console.log(`[wrote] ${w.path}`);
  }

  console.log(
    `[done] regenerated catalog from ${catalog.library.name}@${catalog.library.version}`,
  );
  console.log('[hint] run `pnpm check:write` to format the generated files');
};

await main();
