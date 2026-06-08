import type { Adapter } from '@decoro/adapter-spec';
import {
  findUncoveredComponents,
  renderViaJsonRender,
} from '@decoro/adapter-spec';
import type { Spec } from '@json-render/core';

import { arteOdysseyAdapter, catalog, metadata, registry } from './index.ts';

const run = (spec: Spec) =>
  renderViaJsonRender(spec, arteOdysseyAdapter.registryModule);

describe('adapter-arte-odyssey', () => {
  it('re-exports arte-odyssey first-party catalog with the expected components', () => {
    const names = catalog.componentNames;
    // A representative slice of the first-party catalog
    // (`@k8o/arte-odyssey/json-render`).
    for (const name of ['Stack', 'Grid', 'Button', 'Card', 'Alert', 'Tabs']) {
      expect(names).toContain(name);
    }
  });

  it('exposes a registry renderer for every catalog component', () => {
    expect(findUncoveredComponents(catalog, registry)).toEqual([]);
  });

  it('describes itself via metadata', () => {
    expect(metadata.name).toBe('@k8o/arte-odyssey');
    expect(metadata.displayName).toBe('ArteOdyssey');
    expect(metadata.version).toBe('10.0.0');
  });

  it('registryModule resolves to the exact registry the adapter renders with', async () => {
    // Not a tautology against the literal: actually import the specifier and
    // assert the named export IS the registry object — so a typo'd specifier
    // (module-not-found) or wrong exportName (undefined) fails here, at test
    // time, instead of in a user's copied output. renderViaJsonRender is the
    // sole consumer of registryModule.
    const { specifier, exportName } = arteOdysseyAdapter.registryModule;
    const mod = (await import(specifier)) as Record<string, unknown>;
    expect(mod[exportName]).toBe(registry);
  });

  it('has no bespoke codeOutput (uses the generic Renderer fallback)', () => {
    const asContract: Adapter = arteOdysseyAdapter;
    expect(asContract.codeOutput).toBeUndefined();
  });

  describe('generic code output (renderViaJsonRender)', () => {
    it('returns empty string for an empty / unresolved spec', () => {
      expect(run({ root: '', elements: {} })).toBe('');
      expect(run({ root: 'missing', elements: {} })).toBe('');
    });

    it('emits a self-contained <Renderer> wrapper that re-uses the library registry', () => {
      const tsx = run({
        root: 'btn',
        elements: {
          btn: {
            type: 'Button',
            props: { label: 'Save', tone: 'primary' },
            children: [],
          },
        },
      });
      expect(tsx).toContain("'use client';");
      expect(tsx).toContain(
        "import { JSONUIProvider, Renderer } from '@json-render/react';",
      );
      expect(tsx).toContain(
        "import { registry } from '@k8o/arte-odyssey/json-render/registry';",
      );
      expect(tsx).toContain('<Renderer registry={registry} spec={spec} />');
      // The spec is inlined verbatim so the generated component is self-contained.
      expect(tsx).toContain('"type": "Button"');
      expect(tsx).toContain('"label": "Save"');
    });
  });
});
