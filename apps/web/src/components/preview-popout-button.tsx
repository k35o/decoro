'use client';

import { ExternalLinkIcon, IconButton } from '@k8o/arte-odyssey';

const openPreviewPopout = () => {
  // Sized to fit a 1280×800 reference design with browser chrome.
  // `noopener` is fine — same-origin BroadcastChannel is the transport,
  // we don't need an opener reference.
  window.open(
    '/preview',
    'decoro-preview',
    'popup,width=1280,height=900,noopener',
  );
};

/**
 * Pops the preview iframe out into a new browser window so the spec
 * has more screen real estate. The new window points at `/preview`
 * (same route the embedded iframe uses) and subscribes to the same
 * BroadcastChannel, so spec updates land in both surfaces in lockstep.
 */
export const PreviewPopoutButton = () => (
  <IconButton
    label="Open preview in a new window"
    size="sm"
    bg="transparent"
    onAction={openPreviewPopout}
  >
    <ExternalLinkIcon size="sm" />
  </IconButton>
);
