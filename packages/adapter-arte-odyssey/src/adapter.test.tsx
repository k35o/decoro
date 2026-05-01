import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
});
