/**
 * F2 prototype: extract a `decoro-catalog.json` from a local ArteOdyssey
 * checkout.
 *
 * In the eventual first-release shape (per ADR-011 / issue #25), this
 * extraction lives in the ArteOdyssey repo itself, runs after
 * `pnpm build-storybook`, and uploads the JSON to Chromatic alongside the
 * static build. Decoro's F1 generator (issue #24) then fetches it.
 *
 * Today the script is here so we can iterate on the JSON shape and the
 * extraction itself without an ArteOdyssey-side PR. It is **not** wired into
 * any Decoro workflow.
 *
 * Usage:
 *   pnpm tsx scripts/extract-from-arte-odyssey.ts \
 *     [--arte-odyssey ../ArteOdyssey/packages/arte-odyssey] \
 *     [--out /tmp/decoro-catalog.json]
 *
 * The strict no-unsafe-* rules are disabled file-wide because this script
 * walks Babel ASTs and react-docgen-typescript output — both intentionally
 * `any`-typed at the boundary. The prototype runs once locally and is not
 * loaded by any production code path.
 */
/* oxlint-disable typescript/no-non-null-assertion typescript/no-unsafe-return typescript/no-unsafe-call typescript/no-unsafe-member-access typescript/no-unsafe-argument typescript/no-unsafe-assignment typescript/no-explicit-any typescript/no-redundant-type-constituents eslint/no-console */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';
import { withDefaultConfig } from 'react-docgen-typescript';

const traverse =
  (babelTraverse as unknown as { default?: typeof babelTraverse }).default ??
  babelTraverse;

type CliFlags = { arteOdyssey: string; out: string };

const parseFlags = (args: string[]): CliFlags => {
  const flags: CliFlags = {
    arteOdyssey: resolve('../ArteOdyssey/packages/arte-odyssey'),
    out: resolve('/tmp/decoro-catalog.json'),
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--arte-odyssey') {
      flags.arteOdyssey = resolve(args[++i] ?? '');
    } else if (arg === '--out') {
      flags.out = resolve(args[++i] ?? '');
    }
  }
  return flags;
};

const walkFiles = (root: string, predicate: (path: string) => boolean) => {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        stack.push(full);
      } else if (st.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
};

const isComponentFile = (path: string) =>
  path.endsWith('.tsx') &&
  !path.endsWith('.stories.tsx') &&
  !path.endsWith('.test.tsx');

const isStoryFile = (path: string) => path.endsWith('.stories.tsx');

/**
 * Read `src/components/index.ts` (and any `*Icon` filtering rules) to derive
 * the set of identifiers ArteOdyssey actually publishes. Anything else found
 * by walking the source tree is an internal subcomponent and should be left
 * out of the catalog so the LLM only sees the official surface.
 */
const readPublicExports = (arteOdysseyRoot: string): Set<string> => {
  const indexPath = join(arteOdysseyRoot, 'src/components/index.ts');
  const src = readFileSync(indexPath, 'utf8');
  const ast = parseBabel(src, {
    sourceType: 'module',
    plugins: ['typescript'],
  });
  const names = new Set<string>();
  traverse(ast, {
    ExportNamedDeclaration(path) {
      for (const spec of path.node.specifiers) {
        if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
          names.add(spec.exported.name);
        }
      }
    },
  });
  return names;
};

/**
 * Filter rules applied on top of public exports:
 * - Drop everything that ends in `Icon` (40+ visual icons; not useful as
 *   AI-pickable layout components).
 * - Drop hooks (anything starting with `use`).
 * - Drop providers / context wrappers (anything ending in `Provider`).
 */
const isCatalogCandidate = (name: string): boolean => {
  if (name.endsWith('Icon')) return false;
  if (name.startsWith('use')) return false;
  if (name.endsWith('Provider')) return false;
  if (name === 'Logo') return false;
  return true;
};

type DecoroCatalog = {
  schemaVersion: 1;
  library: { name: string; version: string };
  components: ComponentEntry[];
};

type ComponentEntry = {
  name: string;
  importPath: string;
  description: string;
  sourcePath: string;
  props: PropEntry[];
  examples: ExampleEntry[];
};

type PropEntry = {
  name: string;
  description: string;
  required: boolean;
  defaultValue: unknown;
  type: PropType;
};

type PropType =
  | { kind: 'enum'; values: string[] }
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'union'; raw: string }
  | { kind: 'unknown'; raw: string };

type ExampleEntry = {
  name: string;
  args: Record<string, unknown>;
};

type DocgenPropType = {
  name: string;
  value?: ReadonlyArray<{ value: string }>;
  raw?: string;
};

const classifyType = (typeInfo: DocgenPropType): PropType => {
  const name = typeInfo.name.trim();
  // react-docgen-typescript reports literal unions as `name: 'enum'` with the
  // members in `value: [{ value: '"primary"' }, ...]`.
  if (name === 'enum' && Array.isArray(typeInfo.value)) {
    const literals = typeInfo.value
      .map((v) => v.value.trim())
      .filter((v) => /^("[^"]*"|'[^']*'|true|false|null|undefined)$/.test(v));
    const stringLits = literals
      .filter((v) => /^("[^"]*"|'[^']*')$/.test(v))
      .map((v) => v.slice(1, -1));
    if (stringLits.length === literals.length && stringLits.length > 0) {
      return { kind: 'enum', values: stringLits };
    }
  }
  if (name === 'string') return { kind: 'string' };
  if (name === 'number') return { kind: 'number' };
  if (name === 'boolean') return { kind: 'boolean' };
  if (name.includes('|')) return { kind: 'union', raw: name };
  return { kind: 'unknown', raw: typeInfo.raw ?? name };
};

const extractComponents = (
  arteOdysseyRoot: string,
  componentFiles: string[],
): Map<string, ComponentEntry> => {
  const tsconfigPath = join(arteOdysseyRoot, 'tsconfig.json');
  const parser = withDefaultConfig({
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    savePropValueAsString: false,
    propFilter: (prop) => {
      if (prop.parent === undefined) return true;
      // Drop props inherited from React/HTML (HTMLAttributes etc.) — we only
      // want the component-specific surface in the AI catalog.
      return !prop.parent.fileName.includes('node_modules');
    },
  });

  const componentsByName = new Map<string, ComponentEntry>();
  let parsed = 0;

  for (const file of componentFiles) {
    let docs;
    try {
      docs = parser.parse(file);
    } catch (err) {
      console.warn(
        `[skip] react-docgen-typescript failed for ${relative(arteOdysseyRoot, file)}: ${(err as Error).message}`,
      );
      continue;
    }
    for (const doc of docs) {
      if (componentsByName.has(doc.displayName)) continue;
      const props: PropEntry[] = Object.entries(doc.props).map(
        ([name, info]) => ({
          name,
          description: info.description,
          required: info.required,
          defaultValue: info.defaultValue?.value,
          type: classifyType(info.type as DocgenPropType),
        }),
      );
      componentsByName.set(doc.displayName, {
        name: doc.displayName,
        importPath: '@k8o/arte-odyssey',
        description: doc.description,
        sourcePath: relative(arteOdysseyRoot, file),
        props,
        examples: [],
      });
      parsed += 1;
    }
    void tsconfigPath;
  }

  console.log(`[info] react-docgen-typescript: parsed ${parsed} components`);
  return componentsByName;
};

const extractStoryArgs = (
  arteOdysseyRoot: string,
  storyFiles: string[],
  componentsByName: Map<string, ComponentEntry>,
) => {
  let attached = 0;
  let skipped = 0;
  for (const file of storyFiles) {
    let ast;
    try {
      const src = readFileSync(file, 'utf8');
      ast = parseBabel(src, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });
    } catch (err) {
      console.warn(
        `[skip] babel parse failed for ${relative(arteOdysseyRoot, file)}: ${(err as Error).message}`,
      );
      skipped += 1;
      continue;
    }

    let componentName: string | undefined;
    let metaArgs: Record<string, unknown> = {};
    const stories: ExampleEntry[] = [];

    traverse(ast, {
      // `const meta: Meta<typeof Button> = { component: Button, args: {...} }`
      VariableDeclarator(path) {
        if (
          t.isIdentifier(path.node.id) &&
          path.node.id.name === 'meta' &&
          t.isObjectExpression(path.node.init)
        ) {
          for (const prop of path.node.init.properties) {
            if (!t.isObjectProperty(prop)) continue;
            const key = propKeyName(prop.key);
            if (key === 'component' && t.isIdentifier(prop.value)) {
              componentName = prop.value.name;
            } else if (key === 'args' && t.isObjectExpression(prop.value)) {
              metaArgs = literalObject(prop.value);
            }
          }
        }
      },
      // `export const Primary: Story = { args: {...} }`
      ExportNamedDeclaration(path) {
        if (!t.isVariableDeclaration(path.node.declaration)) return;
        for (const declarator of path.node.declaration.declarations) {
          if (
            !t.isIdentifier(declarator.id) ||
            !t.isObjectExpression(declarator.init)
          )
            continue;
          const storyName = declarator.id.name;
          if (storyName === 'meta') continue;
          const storyArgs = pickArgs(declarator.init);
          stories.push({
            name: storyName,
            args: { ...metaArgs, ...storyArgs },
          });
        }
      },
    });

    if (componentName === undefined) {
      console.warn(
        `[skip] no \`component\` field in ${relative(arteOdysseyRoot, file)}`,
      );
      skipped += 1;
      continue;
    }

    const entry = componentsByName.get(componentName);
    if (entry === undefined) {
      console.warn(
        `[skip] story for unknown component "${componentName}" in ${relative(arteOdysseyRoot, file)}`,
      );
      skipped += 1;
      continue;
    }
    entry.examples.push(...stories);
    attached += stories.length;
  }
  console.log(
    `[info] stories: attached ${attached} examples (${skipped} files skipped)`,
  );
};

const propKeyName = (key: t.Expression | t.PrivateName): string | undefined => {
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  return undefined;
};

const pickArgs = (obj: t.ObjectExpression): Record<string, unknown> => {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    if (propKeyName(prop.key) === 'args' && t.isObjectExpression(prop.value)) {
      return literalObject(prop.value);
    }
  }
  return {};
};

const literalObject = (obj: t.ObjectExpression): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = propKeyName(prop.key);
    if (key === undefined) continue;
    const value = literalValue(prop.value);
    if (value !== UNRESOLVABLE) out[key] = value;
  }
  return out;
};

const UNRESOLVABLE = Symbol('unresolvable');

const literalValue = (
  node: t.Expression | t.PatternLike,
): unknown | typeof UNRESOLVABLE => {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isBooleanLiteral(node)) return node.value;
  if (t.isNullLiteral(node)) return null;
  if (t.isArrayExpression(node)) {
    const out: unknown[] = [];
    for (const element of node.elements) {
      if (element === null) continue;
      if (t.isSpreadElement(element)) continue;
      const v = literalValue(element);
      if (v === UNRESOLVABLE) continue;
      out.push(v);
    }
    return out;
  }
  if (t.isObjectExpression(node)) return literalObject(node);
  // Identifiers / function expressions / icon JSX etc. — skip silently.
  return UNRESOLVABLE;
};

const main = () => {
  const flags = parseFlags(argv.slice(2));
  console.log(`[info] arte-odyssey root: ${flags.arteOdyssey}`);
  console.log(`[info] output: ${flags.out}`);

  let pkg;
  try {
    pkg = JSON.parse(
      readFileSync(join(flags.arteOdyssey, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
  } catch (err) {
    console.error(
      `[fatal] could not read ${join(flags.arteOdyssey, 'package.json')}: ${(err as Error).message}`,
    );
    exit(1);
  }

  const srcRoot = join(flags.arteOdyssey, 'src/components');
  const componentFiles = walkFiles(srcRoot, isComponentFile);
  const storyFiles = walkFiles(srcRoot, isStoryFile);
  const publicExports = readPublicExports(flags.arteOdyssey);
  const catalogTargets = new Set(
    [...publicExports].filter((n) => isCatalogCandidate(n)),
  );
  console.log(
    `[info] discovered ${componentFiles.length} components, ${storyFiles.length} stories`,
  );
  console.log(
    `[info] public exports: ${publicExports.size}, catalog targets after filter: ${catalogTargets.size}`,
  );

  const componentsByName = extractComponents(flags.arteOdyssey, componentFiles);
  extractStoryArgs(flags.arteOdyssey, storyFiles, componentsByName);

  const catalog: DecoroCatalog = {
    schemaVersion: 1,
    library: { name: pkg.name, version: pkg.version },
    components: [...componentsByName.values()]
      .filter((c) => catalogTargets.has(c.name))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
  };

  writeFileSync(flags.out, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `[done] wrote ${catalog.components.length} components to ${flags.out}`,
  );
  void dirname;
};

main();
