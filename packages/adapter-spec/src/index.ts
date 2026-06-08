import type { Catalog, Spec } from '@json-render/core';

/**
 * Free-form description of the target component library, surfaced in the UI
 * and threaded into the generation prompt.
 *
 * - `name`: package identifier (e.g. `'@k8o/arte-odyssey'`). Stable id;
 *   not user-facing.
 * - `displayName`: short proper-noun label shown in the Decoro UI (header
 *   tagline, empty-state copy, etc.). Use the human-readable brand name
 *   ("ArteOdyssey", "Material UI", "Chakra UI") rather than the package
 *   id.
 * - `version`: the library version this adapter targets.
 * - `designPrinciples`: high-level philosophy ("prefer semantic components",
 *   "use primary color for the main CTA", etc.). Read by the operator
 *   building intuition for the library and by the LLM as background
 *   context.
 * - `promptGuidance`: concrete "do this, not that" rules the LLM tends to
 *   trip on for THIS specific library. Kept separate from `designPrinciples`
 *   because Decoro's universal prompt (response format, mockup-first
 *   generation, spec model rules) sits beside it in the system prompt;
 *   mixing them dilutes both. Leave undefined when the library's first-party
 *   `catalog.prompt()` + per-component descriptions already cover the gotchas.
 */
export type AdapterMetadata = {
  name: string;
  displayName: string;
  version: string;
  designPrinciples: string;
  promptGuidance?: string;
};

/**
 * Where the library's json-render registry lives, so Decoro's generic code
 * exporter can emit a runtime `<Renderer>` that re-uses it (see
 * {@link renderViaJsonRender}).
 *
 * - `specifier`: the ES module path the generated code imports from, e.g.
 *   `'@k8o/arte-odyssey/json-render/registry'`.
 * - `exportName`: the named export on that module that holds the
 *   `ComponentRegistry` (conventionally `'registry'`).
 */
export type RegistryModule = {
  specifier: string;
  exportName: string;
};

/**
 * Optional hook for emitting **native** design-system TSX from a Spec.
 *
 * This cannot be derived from the catalog alone: a json-render catalog
 * describes LLM-facing prop *abstractions* (`label`, `tabs`, `columns`/`rows`,
 * …), and the mapping from those to real component JSX lives only in the
 * registry's runtime render functions. An adapter that wants native TSX
 * output has to provide a code-emitting counterpart here. When absent, Decoro
 * falls back to {@link renderViaJsonRender}, which works for any library from
 * the catalog + registry alone.
 *
 * - `importPath`: where the generated code imports components from.
 * - `generate(spec)`: returns a self-contained TSX string. Empty spec yields
 *   `''`. May throw for malformed input (cycle, unknown component);
 *   interactive callers should catch and degrade.
 */
export type AdapterCodeOutput = {
  importPath: string;
  generate: (spec: Spec) => string;
};

/**
 * What an adapter must expose so Decoro can drive UI generation against a
 * specific component library.
 *
 * The contract is deliberately thin: a library that ships a json-render
 * `catalog` (for `catalog.prompt()`) and `registry` (for `<Renderer>`) gets
 * the full Decoro experience — prompt, live preview, and copyable code —
 * without any per-library code in Decoro. `codeOutput` is the one optional
 * escalation, for libraries that want native TSX instead of the generic
 * runtime-`<Renderer>` output.
 *
 * `registry` is typed structurally (rather than json-render's
 * `ComponentRegistry`) so this contract package stays React-free. The
 * `TRegistry` parameter lets a concrete binding carry its real registry type
 * (e.g. `Adapter<typeof arteOdysseyAdapter.registry>`) so the precise type
 * reaches `<Renderer>` while `codeOutput` stays readable as an optional —
 * the default keeps the contract usable with bare `satisfies Adapter`.
 */
export type Adapter<
  TRegistry extends Record<string, unknown> = Record<string, unknown>,
> = {
  metadata: AdapterMetadata;
  catalog: Catalog;
  registry: TRegistry;
  registryModule: RegistryModule;
  codeOutput?: AdapterCodeOutput;
};

/**
 * The load-bearing any-library invariant: every component the catalog exposes
 * to the LLM must have a renderer in the registry. A catalog name with no
 * registry entry renders as an empty slot (json-render warns and returns
 * `null`) — a silent gap a new adapter author would otherwise only hit at
 * generation time. Returns the catalog component names missing from the
 * registry (empty array = fully covered). Pure string-set diff, React-free,
 * so it runs in tests and as a dev-boot assertion alike.
 */
export const findUncoveredComponents = (
  catalog: Catalog,
  registry: Record<string, unknown>,
): string[] => catalog.componentNames.filter((name) => !(name in registry));

/**
 * Library-agnostic code output: emit a self-contained component that renders
 * the spec at runtime through json-render's `<Renderer>` and the library's
 * own registry. This is the only code output assemblable from the catalog +
 * spec alone — it re-uses the exact render functions the preview uses, so it
 * is always correct, at the cost of carrying a json-render runtime dependency
 * instead of being plain design-system JSX.
 *
 * Empty / unresolved specs yield `''` (parity with `AdapterCodeOutput.generate`).
 */
export const renderViaJsonRender = (
  spec: Spec,
  registryModule: RegistryModule,
): string => {
  if (spec.root === '' || spec.elements[spec.root] === undefined) return '';
  const importClause =
    registryModule.exportName === 'registry'
      ? 'registry'
      : `${registryModule.exportName} as registry`;
  const specLiteral = JSON.stringify(spec, null, 2);
  return [
    "'use client';",
    '',
    "import type { Spec } from '@json-render/core';",
    "import { JSONUIProvider, Renderer } from '@json-render/react';",
    `import { ${importClause} } from '${registryModule.specifier}';`,
    '',
    `const spec: Spec = ${specLiteral};`,
    '',
    'export const GeneratedComponent = () => (',
    '  <JSONUIProvider registry={registry}>',
    '    <Renderer registry={registry} spec={spec} />',
    '  </JSONUIProvider>',
    ');',
    '',
  ].join('\n');
};
