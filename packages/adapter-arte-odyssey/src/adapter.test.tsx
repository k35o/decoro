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
