'use client';

import { ViewIcon } from '@k8o/arte-odyssey';
import { useState } from 'react';

import type { ChatMessage } from '../lib/chat-types.ts';
import { useDecoroChat } from '../lib/use-decoro-chat.ts';
import { AppHeader } from './app-header.tsx';
import { ChatPane } from './chat-pane.tsx';
import { CodePanel } from './code-panel.tsx';
import { PreviewFrame } from './preview-frame.tsx';
import { ShareButton } from './share-button.tsx';
import {
  CodeBracketsIcon,
  type TabItem,
  TabSwitcher,
} from './tab-switcher.tsx';

type OutputTab = 'preview' | 'code';

const OUTPUT_TABS: ReadonlyArray<TabItem<OutputTab>> = [
  { id: 'preview', label: 'Preview', icon: <ViewIcon size="sm" /> },
  { id: 'code', label: 'Code', icon: <CodeBracketsIcon /> },
];

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
      <AppHeader
        tagline="AI UI generation for ArteOdyssey"
        rightSlot={
          <ShareButton
            spec={spec}
            messages={chatMessages}
            isStreaming={isStreaming}
          />
        }
      />
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
          <TabSwitcher
            ariaLabel="Output"
            tabs={OUTPUT_TABS}
            value={tab}
            onChange={setTab}
          />
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
