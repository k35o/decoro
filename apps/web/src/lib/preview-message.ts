import type { Spec } from '@json-render/core';

/**
 * Messages exchanged between the parent (`/`) and the preview iframe
 * (`/preview`). All messages share a `decoro:` prefix to make them easy to
 * filter from unrelated postMessage traffic.
 */
export type PreviewInboundMessage = {
  type: 'decoro:spec';
  spec: Spec;
};

export type PreviewOutboundMessage = {
  type: 'decoro:ready';
};

export type PreviewMessage = PreviewInboundMessage | PreviewOutboundMessage;

export const isPreviewMessage = (value: unknown): value is PreviewMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const { type } = value as { type?: unknown };
  return type === 'decoro:spec' || type === 'decoro:ready';
};
