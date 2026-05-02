'use client';

import type { Spec } from '@json-render/core';
import { Button, LinkIcon } from '@k8o/arte-odyssey';
import { useEffect, useState } from 'react';

import type { ChatMessage } from '../lib/chat-types.ts';

type Props = {
  spec: Spec | null;
  messages: ChatMessage[];
  isStreaming: boolean;
};

const FEEDBACK_MS = 4000;

type ShareState =
  | { kind: 'idle' }
  | { kind: 'sharing' }
  | { kind: 'shared'; url: string; clipboardOk: boolean }
  | { kind: 'failed'; message: string };

/**
 * Share button + inline feedback. Posts the current `(messages, spec)` to
 * `/api/share`, copies the returned URL to the clipboard, and shows it
 * inline for a couple of seconds (with a fallback link if the clipboard
 * write fails — e.g. when the document isn't focused or the page is served
 * over plain HTTP without the Clipboard API).
 *
 * Disabled while streaming or before the first generation lands; sharing a
 * mid-stream snapshot would capture an inconsistent spec.
 */
export const ShareButton = ({ spec, messages, isStreaming }: Props) => {
  const [state, setState] = useState<ShareState>({ kind: 'idle' });

  useEffect(() => {
    if (state.kind === 'idle' || state.kind === 'sharing') {
      return () => {
        // No timer to clear in idle/sharing branch.
      };
    }
    const timer = setTimeout(() => {
      setState({ kind: 'idle' });
    }, FEEDBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);

  const disabled =
    isStreaming ||
    spec === null ||
    spec.root === '' ||
    state.kind === 'sharing';

  const onShare = async () => {
    if (disabled) return;
    setState({ kind: 'sharing' });
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
          })),
          spec,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? `HTTP ${res.status.toString()}`);
      }
      const { url } = (await res.json()) as { url: string };
      let clipboardOk = true;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard might be unavailable (no HTTPS, blurred document, …).
        // The URL still surfaces inline below as a fallback. Track the
        // failure so the button label doesn't lie about whether the copy
        // actually happened.
        clipboardOk = false;
      }
      setState({ kind: 'shared', url, clipboardOk });
    } catch (err) {
      setState({
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const label =
    state.kind === 'sharing'
      ? 'Sharing…'
      : state.kind === 'shared'
        ? state.clipboardOk
          ? 'Link copied!'
          : 'Link ready · copy below'
        : state.kind === 'failed'
          ? 'Share failed'
          : 'Share';

  return (
    <div className="flex items-center gap-3">
      {state.kind === 'shared' ? (
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="text-fg-mute hover:text-primary-fg max-w-[18rem] truncate font-mono text-xs underline"
        >
          {state.url}
        </a>
      ) : null}
      {state.kind === 'failed' ? (
        <p
          className="text-fg-error max-w-[18rem] truncate text-xs"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      <Button
        size="sm"
        variant="outlined"
        color="gray"
        disabled={disabled}
        onAction={onShare}
        startIcon={<LinkIcon size="sm" />}
      >
        {label}
      </Button>
    </div>
  );
};
