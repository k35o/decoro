import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { isAllowedClassName } from './class-name-allowlist.ts';
import { arteOdysseyAdapter } from './index.ts';

const fakeRenderProps = <P,>(element: { type: string; props: P }) => ({
  element: { key: 'k1', children: [], visible: undefined, ...element },
  emit: () => {},
  on: () => ({
    shouldPreventDefault: false,
    bound: false,
    emit: () => {},
  }),
});

describe('adapter-arte-odyssey', () => {
  it('exposes Button and Card in the registry', () => {
    expect(arteOdysseyAdapter.registry).toHaveProperty('Button');
    expect(arteOdysseyAdapter.registry).toHaveProperty('Card');
  });

  it('declares the import path used by code generation', () => {
    expect(arteOdysseyAdapter.codeOutput.importPath).toBe('@k8o/arte-odyssey');
  });

  it('generates empty string for an empty spec', () => {
    expect(
      arteOdysseyAdapter.codeOutput.generate({ root: '', elements: {} }),
    ).toBe('');
  });

  it('generates valid TSX for a Card containing a Button', () => {
    const tsx = arteOdysseyAdapter.codeOutput.generate({
      root: 'card-1',
      elements: {
        'card-1': {
          type: 'Card',
          props: { appearance: 'shadow' },
          children: ['btn-1'],
        },
        'btn-1': {
          type: 'Button',
          props: {
            label: 'Save',
            color: 'primary',
            variant: 'contained',
            type: null,
            size: null,
            fullWidth: null,
            disabled: null,
          },
          children: [],
        },
      },
    });
    expect(tsx).toContain("import { Button, Card } from '@k8o/arte-odyssey';");
    expect(tsx).toContain('export const GeneratedComponent');
    expect(tsx).toContain('<Card appearance="shadow">');
    expect(tsx).toContain(
      '<Button color="primary" variant="contained">{"Save"}</Button>',
    );
    expect(tsx).toContain('</Card>');
  });

  it('strips props the catalog schema does not declare (e.g. className on Card)', () => {
    // Regression: the LLM occasionally hallucinates `className` on
    // ArteOdyssey components like Card / Button that don't accept it,
    // producing TSX that fails to compile when pasted into a real codebase.
    // Codegen runs every element's props through its catalog schema before
    // serialising; Zod's default safeParse drops unknown keys.
    const tsx = arteOdysseyAdapter.codeOutput.generate({
      root: 'card-1',
      elements: {
        'card-1': {
          type: 'Card',
          props: {
            width: 'fit',
            appearance: 'shadow',
            className: 'p-6 max-w-sm mx-auto my-12',
          },
          children: [],
        },
      },
    });
    expect(tsx).not.toContain('className=');
    expect(tsx).toContain('<Card width="fit" appearance="shadow" />');
  });

  it('throws on a spec containing an unknown component type', () => {
    expect(() =>
      arteOdysseyAdapter.codeOutput.generate({
        root: 'unknown',
        elements: {
          unknown: { type: 'NotInCatalog', props: {}, children: [] },
        },
      }),
    ).toThrow(/missing formatter for "NotInCatalog"/);
  });

  it('throws on a spec with a cycle in the children graph', () => {
    expect(() =>
      arteOdysseyAdapter.codeOutput.generate({
        root: 'a',
        elements: {
          a: { type: 'Card', props: {}, children: ['b'] },
          b: { type: 'Card', props: {}, children: ['a'] },
        },
      }),
    ).toThrow(/cycle detected/);
  });

  it('escapes JSX-significant characters in Button labels', () => {
    const tsx = arteOdysseyAdapter.codeOutput.generate({
      root: 'btn',
      elements: {
        btn: {
          type: 'Button',
          props: {
            label: 'Save & Close <"now">',
            color: null,
            variant: null,
            type: null,
            size: null,
            fullWidth: null,
            disabled: null,
          },
          children: [],
        },
      },
    });
    // Wrapped in a JSX expression with a JS string literal — valid TSX even
    // though the label contains `<`, `&`, `>`, and quotes.
    expect(tsx).toContain('<Button>{"Save & Close <\\"now\\">"}</Button>');
  });

  it('renders Card via the registry', () => {
    const CardRenderer = arteOdysseyAdapter.registry['Card']!;
    const html = renderToStaticMarkup(
      createElement(
        CardRenderer,
        fakeRenderProps({ type: 'Card', props: {} }),
        'hello world',
      ),
    );
    expect(html).toContain('hello world');
  });

  it('renders Button via the registry', () => {
    const ButtonRenderer = arteOdysseyAdapter.registry['Button']!;
    const html = renderToStaticMarkup(
      createElement(
        ButtonRenderer,
        fakeRenderProps({
          type: 'Button',
          props: {
            label: 'Submit',
            type: null,
            size: null,
            color: null,
            variant: null,
            fullWidth: null,
            disabled: null,
          },
        }),
      ),
    );
    expect(html).toContain('Submit');
  });

  describe('layout HTML elements (ADR-012)', () => {
    it('exposes div / section / header / main in the registry', () => {
      expect(arteOdysseyAdapter.registry).toHaveProperty('div');
      expect(arteOdysseyAdapter.registry).toHaveProperty('section');
      expect(arteOdysseyAdapter.registry).toHaveProperty('header');
      expect(arteOdysseyAdapter.registry).toHaveProperty('main');
    });

    it('renders div via the registry with a passed className', () => {
      const DivRenderer = arteOdysseyAdapter.registry['div']!;
      const html = renderToStaticMarkup(
        createElement(
          DivRenderer,
          fakeRenderProps({
            type: 'div',
            props: { className: 'flex flex-col gap-4' },
          }),
          'pane',
        ),
      );
      expect(html).toBe('<div class="flex flex-col gap-4">pane</div>');
    });

    it('emits HTML elements verbatim in generated TSX (no import line)', () => {
      const tsx = arteOdysseyAdapter.codeOutput.generate({
        root: 'shell',
        elements: {
          shell: {
            type: 'div',
            props: { className: 'flex flex-col gap-4 p-6' },
            children: ['btn'],
          },
          btn: {
            type: 'Button',
            props: {
              label: 'Save',
              type: null,
              size: null,
              color: null,
              variant: null,
              fullWidth: null,
              disabled: null,
            },
            children: [],
          },
        },
      });
      // Only ArteOdyssey components (Button) belong in the import line; div
      // is native HTML and stays out of it.
      expect(tsx).toContain("import { Button } from '@k8o/arte-odyssey';");
      expect(tsx).not.toContain(', div');
      expect(tsx).not.toContain('div }');
      expect(tsx).toContain('<div className="flex flex-col gap-4 p-6">');
      expect(tsx).toContain('</div>');
    });

    it('emits a self-closing tag when className is null and there are no children', () => {
      const tsx = arteOdysseyAdapter.codeOutput.generate({
        root: 'spacer',
        elements: {
          spacer: { type: 'section', props: { className: null }, children: [] },
        },
      });
      expect(tsx).toContain('<section />');
    });
  });

  describe('className allowlist (ADR-012)', () => {
    it('accepts curated layout utilities', () => {
      expect(isAllowedClassName('flex')).toBe(true);
      expect(isAllowedClassName('flex flex-col gap-4 p-6')).toBe(true);
      expect(isAllowedClassName('w-full bg-bg-base text-fg-base')).toBe(true);
      expect(isAllowedClassName('  flex   gap-2  ')).toBe(true);
      expect(isAllowedClassName('')).toBe(true);
    });

    it('rejects raw palette / arbitrary / off-token utilities', () => {
      expect(isAllowedClassName('bg-red-500')).toBe(false);
      expect(isAllowedClassName('text-9xl')).toBe(false);
      expect(isAllowedClassName('gap-[37px]')).toBe(false);
      expect(isAllowedClassName('flex bg-red-500')).toBe(false);
    });
  });
});
