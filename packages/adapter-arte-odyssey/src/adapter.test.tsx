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
      '<Button color="primary" variant="contained">Save</Button>',
    );
    expect(tsx).toContain('</Card>');
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
