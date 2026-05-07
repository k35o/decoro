import type { Spec } from '@json-render/core';

/**
 * Messages exchanged between the main app and any preview surface
 * (the embedded iframe at `/preview`, plus any popped-out windows the
 * user opens). All consumers subscribe to a single same-origin
 * BroadcastChannel, so adding a popout window is "open `/preview` in a
 * new window" — no new wiring needed.
 *
 * All messages share a `decoro:` prefix to make them easy to filter from
 * unrelated traffic on the channel.
 */
export const PREVIEW_CHANNEL = 'decoro:preview';

export type PreviewSpecMessage = {
  type: 'decoro:spec';
  spec: Spec;
};

/**
 * Sent by a fresh preview surface to ask the main app to re-broadcast the
 * current spec. The main app's broadcast hook responds with the latest
 * `decoro:spec` so the new consumer doesn't have to wait for the next
 * change to populate.
 */
export type PreviewReadyMessage = {
  type: 'decoro:ready';
};

export type PreviewMessage = PreviewSpecMessage | PreviewReadyMessage;

export const isPreviewMessage = (value: unknown): value is PreviewMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const { type } = value as { type?: unknown };
  return type === 'decoro:spec' || type === 'decoro:ready';
};
