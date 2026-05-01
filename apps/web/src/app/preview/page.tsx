'use client';

import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import type { Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
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
    <div className="bg-bg-base text-fg-base min-h-dvh p-6">
      {spec ? (
        <JSONUIProvider registry={arteOdysseyAdapter.registry}>
          <Renderer spec={spec} registry={arteOdysseyAdapter.registry} />
        </JSONUIProvider>
      ) : (
        <p className="text-fg-mute">Waiting for a spec from the parent…</p>
      )}
    </div>
  );
};

export default PreviewPage;
