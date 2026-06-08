import type { Adapter } from '@decoro/adapter-spec';
import { catalog } from '@k8o/arte-odyssey/json-render';
import { registry } from '@k8o/arte-odyssey/json-render/registry';

import { metadata } from './metadata.ts';

/**
 * Decoro adapter for ArteOdyssey, built entirely on arte-odyssey's
 * first-party json-render integration — no bespoke catalog or codegen lives
 * in Decoro anymore:
 *
 *   - `catalog`  ← `@k8o/arte-odyssey/json-render` (server-safe; drives
 *                  `catalog.prompt()` and the spec contract).
 *   - `registry` ← `@k8o/arte-odyssey/json-render/registry` ('use client';
 *                  drives `<Renderer>` in the live preview).
 *
 * Code output is handled by Decoro's library-agnostic
 * `renderViaJsonRender` fallback (no `codeOutput` here): the catalog alone
 * can't produce native TSX, since the abstract-prop → real-JSX mapping lives
 * only in the registry's runtime renderers. A native-TSX codegen could be
 * added later as `@k8o/arte-odyssey/json-render/codegen` and wired in via the
 * optional `codeOutput` field.
 *
 * `satisfies Adapter` (rather than a type annotation) keeps `registry`'s
 * precise json-render `ComponentRegistry` type so `apps/web` can pass it
 * straight to `<Renderer>` / `<JSONUIProvider>`.
 */
export const arteOdysseyAdapter = {
  metadata,
  catalog,
  registry,
  registryModule: {
    specifier: '@k8o/arte-odyssey/json-render/registry',
    exportName: 'registry',
  },
} satisfies Adapter;

export { catalog, metadata, registry };
