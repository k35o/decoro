'use client';

import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import type { Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { SparklesIcon } from '@k8o/arte-odyssey';
import { useEffect, useState } from 'react';

import {
  type PreviewOutboundMessage,
  isPreviewMessage,
} from '../../lib/preview-message.ts';

const PreviewPage = () => {
  const [spec, setSpec] = useState<Spec | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Origin check alone lets any same-origin window impersonate the
      // parent. Pin acceptance to the actual parent Window.
      if (event.source !== window.parent) return;
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type === 'decoro:spec') setSpec(event.data.spec);
    };
    window.addEventListener('message', handler);

    const ready: PreviewOutboundMessage = { type: 'decoro:ready' };
    window.parent.postMessage(ready, window.location.origin);

    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  return (
    <div className="bg-bg-base text-fg-base min-h-dvh">
      {spec ? (
        <div className="p-6">
          <JSONUIProvider registry={arteOdysseyAdapter.registry}>
            <Renderer spec={spec} registry={arteOdysseyAdapter.registry} />
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
            Describe a screen on the left — Decoro renders it live with
            ArteOdyssey components.
          </p>
        </div>
      )}
    </div>
  );
};

export default PreviewPage;
