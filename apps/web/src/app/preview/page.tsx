'use client';

import type { Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { SparklesIcon } from '@k8o/arte-odyssey';
import { useEffect, useState } from 'react';

import { adapter } from '../../../decoro.config.ts';
import {
  PREVIEW_CHANNEL,
  type PreviewReadyMessage,
  isPreviewMessage,
} from '../../lib/preview-message.ts';

const PreviewPage = () => {
  const [spec, setSpec] = useState<Spec | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL);
    const handler = (event: MessageEvent) => {
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type === 'decoro:spec') setSpec(event.data.spec);
    };
    channel.addEventListener('message', handler);

    // Ask the publisher (the main app) to (re-)broadcast the current spec.
    // Used both on first mount of the embedded iframe and on first mount
    // of any popped-out preview window — neither should have to wait for
    // the next user action to populate.
    const ready: PreviewReadyMessage = { type: 'decoro:ready' };
    // BroadcastChannel.postMessage takes only the message; the lint
    // rule's targetOrigin requirement applies to window.postMessage.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    channel.postMessage(ready);

    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
  }, []);

  return (
    <div className="bg-bg-base text-fg-base min-h-dvh">
      {spec ? (
        <div className="p-6">
          <JSONUIProvider registry={adapter.registry}>
            <Renderer spec={spec} registry={adapter.registry} />
          </JSONUIProvider>
        </div>
      ) : (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-primary-fg" aria-hidden="true">
            <SparklesIcon size="lg" />
          </span>
          <p className="text-fg-base text-base font-medium">
            Your generated UI will appear here
          </p>
          <p className="text-fg-mute max-w-md text-sm">
            Describe a screen on the left — Decoro renders it live with{' '}
            {adapter.metadata.displayName} components.
          </p>
        </div>
      )}
    </div>
  );
};

export default PreviewPage;
