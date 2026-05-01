import type { Adapter } from '@decoro/adapter-spec';
import type { ComponentRenderer } from '@json-render/react';

import { catalog } from './catalog.ts';
import { codeOutput } from './code-output.ts';
import { metadata } from './metadata.ts';
import { registry } from './registry.tsx';

export const arteOdysseyAdapter: Adapter<ComponentRenderer> = {
  metadata,
  catalog,
  registry,
  codeOutput,
};

export { catalog, codeOutput, metadata, registry };
export type { ButtonProps, CardProps } from './catalog.ts';
