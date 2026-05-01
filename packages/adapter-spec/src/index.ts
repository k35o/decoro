import type { Catalog, Spec } from '@json-render/core';

/**
 * Free-form description of the target component library, surfaced in the UI
 * and threaded into the generation prompt.
 */
export type AdapterMetadata = {
  name: string;
  version: string;
  designPrinciples: string;
};

/**
 * Mapping from Catalog component name to a concrete component implementation.
 *
 * Parametric in `TComponent` so `@decoro/core` can stay framework-agnostic
 * (per ADR-004). Concrete adapters specialize this — e.g.
 * `adapter-arte-odyssey` will pin it to React component types.
 */
export type AdapterRegistry<TComponent = unknown> = Record<string, TComponent>;

/**
 * Hooks an adapter exposes for turning a `json-render` Spec into TSX.
 *
 * **MVP-only contract.** Today this shape assumes a single TSX string and a
 * single ES module import path — the React + ArteOdyssey pairing the MVP
 * targets. That assumption leaks "TSX / React" into adapter-spec, which is
 * supposed to be framework-agnostic. The next non-React adapter (Vue,
 * Svelte, Solid) will force this shape to grow into something like
 * `{ filename, content }[]` keyed by output target. Per ADR-004 we do not
 * pre-abstract — this comment is the contract that the broader shape is on
 * the first-release roadmap (see docs/mvp-scope.md "Beyond MVP"), not in
 * MVP itself.
 *
 * - `importPath`: where the generated code imports components from (e.g.
 *   `'@k8o/arte-odyssey'`).
 * - `generate(spec)`: returns a self-contained TSX string. Empty spec
 *   yields `''`. May throw for malformed input (cycle, unknown component);
 *   interactive callers should catch and degrade rather than letting the
 *   exception bubble up.
 */
export type AdapterCodeOutput = {
  importPath: string;
  generate: (spec: Spec) => string;
};

/**
 * What an adapter must expose so Decoro can drive UI generation against a
 * specific component library.
 *
 * Intentionally minimal. Fields will harden as `adapter-arte-odyssey` (M3)
 * and the codegen wiring (M9) force them to.
 */
export type Adapter<TComponent = unknown> = {
  metadata: AdapterMetadata;
  catalog: Catalog;
  registry: AdapterRegistry<TComponent>;
  codeOutput: AdapterCodeOutput;
};
