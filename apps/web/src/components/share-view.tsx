'use client';

import type { Spec } from '@json-render/core';
import { Anchor, Heading, SparklesIcon, ViewIcon } from '@k8o/arte-odyssey';
import { useEffect, useState } from 'react';

import type { SnapshotRecord } from '../lib/share-types.ts';
import { CodePanel } from './code-panel.tsx';
import { PreviewFrame } from './preview-frame.tsx';

type Props = {
  snapshot: SnapshotRecord;
};

type OutputTab = 'preview' | 'code';

/**
 * Read-only renderer for `/share/[id]`. Mirrors the home shell's two-pane
 * layout but drops the prompt input — viewers cannot iterate on a snapshot.
 *
 * Tabs are rolled by hand for the same reason as `home-shell` (keep the
 * preview iframe mounted across tab switches so its postMessage handshake
 * survives).
 */
export const ShareView = ({ snapshot }: Props) => {
  const [tab, setTab] = useState<OutputTab>('preview');
  // Zod infers `visible` as `unknown`; the Spec contract narrows it to
  // VisibilityCondition. The /api/generate route does the same cast — see
  // its `augmentLastUserMessage` callsite.
  const spec = snapshot.spec as unknown as Spec;
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
      <header className="bg-bg-base border-border-subtle flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-primary-fg" aria-hidden="true">
            <SparklesIcon size="lg" />
          </span>
          <div className="flex items-baseline gap-3">
            <Heading type="h1">Decoro</Heading>
            <p className="text-fg-mute text-sm">Shared snapshot · read-only</p>
          </div>
        </div>
        <Anchor href="/">Open Decoro →</Anchor>
      </header>
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
            {snapshot.messages.map((msg) =>
              msg.role === 'user' ? (
                <li key={msg.id} className="flex justify-end">
                  <div className="bg-primary-bg-mute text-fg-base max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
                    {msg.text}
                  </div>
                </li>
              ) : msg.text === '' ? null : (
                <li key={msg.id} className="flex justify-start">
                  <div className="bg-bg-subtle text-fg-base max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
                    {msg.text}
                  </div>
                </li>
              ),
            )}
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
          <ShareTabs value={tab} onChange={setTab} />
          <div className="relative flex-1 overflow-hidden">
            <div hidden={tab !== 'preview'} className="h-full">
              <PreviewFrame spec={spec} />
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

const ShareTabs = ({
  value,
  onChange,
}: {
  value: OutputTab;
  onChange: (next: OutputTab) => void;
}) => {
  const tabs: Array<{ id: OutputTab; label: string; icon: React.ReactNode }> = [
    { id: 'preview', label: 'Preview', icon: <ViewIcon size="sm" /> },
    { id: 'code', label: 'Code', icon: <CodeBracketsIcon /> },
  ];
  return (
    <div
      role="tablist"
      aria-label="Output"
      className="border-border-subtle bg-bg-base flex gap-1 border-b px-3 pt-2"
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onChange(t.id);
            }}
            className={[
              'relative flex cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'text-primary-fg'
                : 'text-fg-mute hover:bg-primary-bg-subtle hover:text-primary-fg',
            ].join(' ')}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            {active ? (
              <span
                aria-hidden="true"
                className="bg-primary-border absolute right-0 -bottom-px left-0 h-0.5 rounded-full"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

const CodeBracketsIcon = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);
