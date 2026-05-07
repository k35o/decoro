'use client';

import { Anchor, SparklesIcon, ViewIcon } from '@k8o/arte-odyssey';
import { useEffect, useState } from 'react';

import type { SnapshotRecord } from '../lib/share-types.ts';
import { toSpec } from '../lib/spec-schema.ts';
import { usePreviewBroadcast } from '../lib/use-preview-broadcast.ts';
import { AppHeader } from './app-header.tsx';
import { CodePanel } from './code-panel.tsx';
import { PreviewFrame } from './preview-frame.tsx';
import {
  CodeBracketsIcon,
  type TabItem,
  TabSwitcher,
} from './tab-switcher.tsx';

type Props = {
  snapshot: SnapshotRecord;
};

type OutputTab = 'preview' | 'code';

const OUTPUT_TABS: ReadonlyArray<TabItem<OutputTab>> = [
  { id: 'preview', label: 'Preview', icon: <ViewIcon size="sm" /> },
  { id: 'code', label: 'Code', icon: <CodeBracketsIcon /> },
];

/**
 * Read-only renderer for `/share/[id]`. Mirrors the home shell's two-pane
 * layout but drops the prompt input — viewers cannot iterate on a snapshot.
 */
export const ShareView = ({ snapshot }: Props) => {
  const [tab, setTab] = useState<OutputTab>('preview');
  const spec = toSpec(snapshot.spec);
  // Broadcast on the preview channel so the embedded iframe receives the
  // spec via the same mechanism HomeShell uses, and so popping out the
  // preview window from a share page works without extra wiring.
  usePreviewBroadcast(spec);
  // Format the captured-at stamp on the client only. `toLocaleString()`
  // depends on the runtime's locale + timezone; running it during SSR and
  // again on hydration produces a mismatch warning whenever the recipient's
  // browser disagrees with the server. Render the raw ISO string until the
  // effect lands, then swap to the localized form.
  const [formattedCapturedAt, setFormattedCapturedAt] = useState<string | null>(
    null,
  );
  useEffect(() => {
    setFormattedCapturedAt(new Date(snapshot.createdAt).toLocaleString());
  }, [snapshot.createdAt]);

  return (
    <div className="bg-bg-surface text-fg-base flex h-dvh flex-col">
      <AppHeader
        tagline="Shared snapshot · read-only"
        rightSlot={
          <div className="flex items-center gap-4">
            <Anchor href={`/?from=${snapshot.id}`}>
              Continue this conversation →
            </Anchor>
            <Anchor href="/">Open Decoro</Anchor>
          </div>
        }
      />
      <main className="flex flex-1 gap-4 overflow-hidden p-4">
        <section
          aria-label="Conversation"
          className="bg-bg-base flex w-5/12 flex-col overflow-hidden rounded-xl shadow-sm"
        >
          <div className="border-border-subtle flex items-center gap-2 border-b px-5 py-3">
            <span className="text-primary-fg" aria-hidden="true">
              <SparklesIcon size="sm" />
            </span>
            <h2 className="text-fg-base text-sm font-medium">Conversation</h2>
          </div>
          <ul
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
            aria-label="Conversation transcript"
          >
            {snapshot.messages.map((msg) => {
              const attachments = msg.attachments ?? [];
              if (msg.role === 'user') {
                return (
                  <li key={msg.id} className="flex justify-end">
                    <div className="bg-primary-bg-mute text-fg-base flex max-w-[85%] flex-col gap-2 rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
                      {attachments.length > 0 ? (
                        <ul
                          className="flex flex-wrap gap-1.5"
                          aria-label="Image attachments"
                        >
                          {attachments.map((a) => (
                            <li key={a.id}>
                              <a
                                href={a.dataUri}
                                target="_blank"
                                rel="noreferrer"
                                className="block"
                                aria-label="Open image in new tab"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- data URI, no remote optimization */}
                                <img
                                  src={a.dataUri}
                                  alt=""
                                  className="size-24 rounded-md object-cover"
                                />
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {msg.text === '' ? null : <span>{msg.text}</span>}
                    </div>
                  </li>
                );
              }
              if (msg.text === '') return null;
              return (
                <li key={msg.id} className="flex justify-start">
                  <div className="bg-bg-subtle text-fg-base max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
                    {msg.text}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-fg-subtle border-border-subtle border-t px-5 py-3 text-xs">
            Captured{' '}
            <time dateTime={snapshot.createdAt}>
              {formattedCapturedAt ?? snapshot.createdAt}
            </time>
          </p>
        </section>
        <section
          aria-label="Output"
          className="bg-bg-base flex w-7/12 flex-col overflow-hidden rounded-xl shadow-sm"
        >
          <TabSwitcher
            ariaLabel="Output"
            tabs={OUTPUT_TABS}
            value={tab}
            onChange={setTab}
          />
          <div className="relative flex-1 overflow-hidden">
            <div hidden={tab !== 'preview'} className="h-full">
              <PreviewFrame />
            </div>
            <div hidden={tab !== 'code'} className="h-full overflow-auto">
              <CodePanel spec={spec} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
