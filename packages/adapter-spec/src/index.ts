import type { Catalog } from '@json-render/core';

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
 * Loose by design — refined in M9 (`json-render` codegen wiring) once the
 * concrete needs are known. ADR-004: do not pre-abstract.
 */
export type AdapterCodeOutput = {
  /** Module path the generated TSX imports components from. */
  importPath: string;
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
