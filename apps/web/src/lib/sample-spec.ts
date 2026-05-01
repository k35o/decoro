import type { Spec } from '@json-render/core';

/**
 * Hard-coded demo Spec used in M5 to prove the iframe wiring works without
 * the LLM. Replaced by the live LLM stream in M7.
 */
export const sampleSpec: Spec = {
  root: 'demo-card',
  elements: {
    'demo-card': {
      type: 'Card',
      props: { appearance: 'shadow', width: 'fit' },
      children: ['demo-button'],
    },
    'demo-button': {
      type: 'Button',
      props: {
        label: 'Hello from the iframe',
        color: 'primary',
        variant: 'contained',
      },
      children: [],
    },
  },
};
