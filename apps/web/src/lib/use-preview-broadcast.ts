'use client';

import type { Spec } from '@json-render/core';
import { useEffect, useRef } from 'react';

import {
  PREVIEW_CHANNEL,
  type PreviewSpecMessage,
  isPreviewMessage,
} from './preview-message.ts';

/**
 * Owns the publisher side of the preview BroadcastChannel.
 *
 * - Whenever `spec` changes, broadcasts `decoro:spec` so every preview
 *   surface — the embedded iframe AND any popped-out windows — updates
 *   in lockstep.
 * - Listens for `decoro:ready` so a freshly-mounted consumer (e.g. a
 *   popout that just opened) can request the current spec without
 *   waiting for the next change.
 *
 * `spec === null` is left un-broadcast so consumers stay in their built-in
 * "Waiting for a spec…" empty state rather than receiving a partial-render
 * signal.
 */
export const usePreviewBroadcast = (spec: Spec | null) => {
  const specRef = useRef<Spec | null>(spec);
  specRef.current = spec;

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL);
    const handler = (event: MessageEvent) => {
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type !== 'decoro:ready') return;
      const { current } = specRef;
      if (!current) return;
      const message: PreviewSpecMessage = {
        type: 'decoro:spec',
        spec: current,
      };
      // BroadcastChannel.postMessage takes only the message; the
      // targetOrigin arg the lint rule wants is for window.postMessage.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      channel.postMessage(message);
    };
    channel.addEventListener('message', handler);
    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  }, []);

  useEffect(() => {
    if (!spec) return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL);
    const message: PreviewSpecMessage = { type: 'decoro:spec', spec };
    // BroadcastChannel.postMessage takes only the message; see comment above.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    channel.postMessage(message);
    channel.close();
  }, [spec]);
};
