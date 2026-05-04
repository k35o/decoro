import type { Catalog, Spec } from '@json-render/core';

/**
 * Free-form description of the target component library, surfaced in the UI
 * and threaded into the generation prompt.
 *
 * - `designPrinciples`: high-level philosophy ("prefer semantic components",
 *   "use primary color for the main CTA", etc.). Read by the operator
 *   building intuition for the library and by the LLM as background
 *   context.
 * - `promptGuidance`: concrete "do this, not that" rules the LLM tends to
 *   trip on for THIS specific library — the right component for icons,
 *   props that don't accept `className`, library-specific text primitives,
 *   etc. Kept separate from `designPrinciples` because Decoro's universal
 *   prompt (response format, mockup-first generation, spec model rules)
 *   sits beside it in the system prompt; mixing them dilutes both. Leave
 *   undefined if the library has no known LLM gotchas worth calling out.
 */
export type AdapterMetadata = {
  name: string;
  version: string;
  designPrinciples: string;
  promptGuidance?: string;
};

/**
 * Mapping from Catalog component name to a concrete component implementation.
 *
 * Parametric in `TComponent` so the core stays framework-agnostic.
 * Concrete adapters specialize this — e.g. `adapter-arte-odyssey` pins it
 * to React component types.
 */
export type AdapterRegistry<TComponent = unknown> = Record<string, TComponent>;

/**
 * Hooks an adapter exposes for turning a `json-render` Spec into source
 * code.
 *
 * **Current shape assumes a single TSX file and a single ES module import
 * path** — the React + ArteOdyssey pairing this MVP targets. Adding a
 * non-React adapter (Vue, Svelte, Solid) will need this to grow into a
 * multi-file output shape like `{ filename, content }[]`. Until that
 * happens we keep the contract minimal.
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
 * specific component library. Intentionally minimal — implement these four
 * fields and Decoro will route through `decoro.config.ts`'s `adapter`
 * binding.
 */
export type Adapter<TComponent = unknown> = {
  metadata: AdapterMetadata;
  catalog: Catalog;
  registry: AdapterRegistry<TComponent>;
  codeOutput: AdapterCodeOutput;
};
