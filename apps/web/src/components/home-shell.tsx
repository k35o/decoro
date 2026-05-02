'use client';

import { Heading, SparklesIcon, ViewIcon } from '@k8o/arte-odyssey';
import { useState } from 'react';

import { useDecoroChat } from '../lib/use-decoro-chat.ts';
import { type ChatMessage, ChatPane } from './chat-pane.tsx';
import { CodePanel } from './code-panel.tsx';
import { PreviewFrame } from './preview-frame.tsx';

type OutputTab = 'preview' | 'code';

/**
 * Top-level client shell for `/`. Wires the chat pane to `useDecoroChat`,
 * which posts `{ messages, currentSpec }` to /api/generate so each follow-up
 * iterates on the existing spec instead of regenerating from scratch (M8).
 *
 * The right pane shows Preview and Code as tabs. Both are kept mounted via
 * `hidden` so the iframe's spec / postMessage handshake survives tab switches.
 */
export const HomeShell = () => {
  const { messages, spec, isStreaming, error, send } = useDecoroChat({
    api: '/api/generate',
  });
  const [tab, setTab] = useState<OutputTab>('preview');

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
  }));

  return (
    <div className="bg-bg-surface text-fg-base flex h-dvh flex-col">
      <header className="bg-bg-base border-border-subtle border-b">
        <div className="flex items-center gap-3 px-6 py-4">
          <span className="text-primary-fg" aria-hidden="true">
            <SparklesIcon size="lg" />
          </span>
          <div className="flex items-baseline gap-3">
            <Heading type="h1">Decoro</Heading>
            <p className="text-fg-mute text-sm">
              AI UI generation for ArteOdyssey
            </p>
          </div>
        </div>
      </header>
      <main className="flex flex-1 gap-4 overflow-hidden p-4">
        <section
          aria-label="Chat"
          className="bg-bg-base flex w-5/12 flex-col overflow-hidden rounded-xl shadow-sm"
        >
          <ChatPane
            messages={chatMessages}
            isStreaming={isStreaming}
            error={error}
            onSubmit={(prompt) => {
              void send(prompt);
            }}
          />
        </section>
        <section
          aria-label="Output"
          className="bg-bg-base flex w-7/12 flex-col overflow-hidden rounded-xl shadow-sm"
        >
          <OutputTabs value={tab} onChange={setTab} />
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

const OutputTabs = ({
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

/**
 * Inline `< />` glyph used for the Code tab — ArteOdyssey's icon set doesn't
 * ship a code/braces icon, so we draw a tiny one matching `size="sm"`.
 */
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
