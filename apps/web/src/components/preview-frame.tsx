'use client';

import type { Spec } from '@json-render/core';
import { useEffect, useRef, useState } from 'react';

import {
  type PreviewInboundMessage,
  isPreviewMessage,
} from '../lib/preview-message.ts';

type Props = {
  spec: Spec;
};

/**
 * Hosts the `/preview` page in an iframe and pushes the current Spec into it
 * via postMessage. Re-sends whenever `spec` changes after the iframe is ready.
 */
export const PreviewFrame = ({ spec }: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type === 'decoro:ready') setReady(true);
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const message: PreviewInboundMessage = { type: 'decoro:spec', spec };
    iframeRef.current?.contentWindow?.postMessage(
      message,
      window.location.origin,
    );
  }, [ready, spec]);

  return (
    // The iframe exists for style-space isolation (ADR-006), not for security
    // sandboxing — both sides are first-party Decoro routes, so an HTML
    // sandbox would only obstruct postMessage without buying anything.
    // oxlint-disable-next-line eslint-plugin-react(iframe-missing-sandbox)
    <iframe
      ref={iframeRef}
      src="/preview"
      title="Decoro preview"
      className="size-full border-0"
    />
  );
};
