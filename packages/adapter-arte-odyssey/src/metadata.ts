import type { AdapterMetadata } from '@decoro/adapter-spec';

export const metadata: AdapterMetadata = {
  name: '@k8o/arte-odyssey',
  version: '7.0.1',
  designPrinciples: [
    'ArteOdyssey is a React + TypeScript + Tailwind CSS 4 design system.',
    'Prefer semantic, accessible components over div soup.',
    'Color: primary for the main call to action, secondary for supporting actions, gray for neutral / cancel.',
    'Variants: contained for prominence, outlined for secondary affordance, skeleton for ghost/inline use.',
    'Sizes: sm / md / lg. Default to md unless density demands otherwise.',
    'Spacing and rounded corners follow the library defaults — do not override with raw Tailwind unless asked.',
  ].join('\n'),
};
