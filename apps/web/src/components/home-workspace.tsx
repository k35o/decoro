'use client';

import type { Spec } from '@json-render/core';
import { ViewIcon } from '@k8o/arte-odyssey';
import { useState } from 'react';

import type { ChatMessage } from '../lib/chat-types.ts';
import type { DecoroMessage } from '../lib/use-decoro-chat.ts';
import { useDecoroChat } from '../lib/use-decoro-chat.ts';
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

export type WorkspaceSeed = {
  initialState: { messages: DecoroMessage[]; spec: Spec | null } | null;
  conversationId: string | null;
};

type Props = {
  seed: WorkspaceSeed;
};

/**
 * The chat + preview + code panes. Re-mounts (via `key` from the parent)
 * whenever the seed changes, so `useDecoroChat`'s `useState` initializer
 * picks up the new initial messages / spec / conversationId without
 * needing a manual reset path on the hook.
 *
 * Lives in its own module so the parent shell stays under the
 * max-dependencies lint cap and the chat / preview / output concerns are
 * grouped together.
 */
export const HomeWorkspace = ({ seed }: Props) => {
  const { messages, spec, isStreaming, error, send } = useDecoroChat({
    api: '/api/generate',
    initialState: seed.initialState,
    initialConversationId: seed.conversationId,
  });
  const [tab, setTab] = useState<OutputTab>('preview');

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
  }));

  return (
    <>
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
        className="bg-bg-base flex flex-1 flex-col overflow-hidden rounded-xl shadow-sm"
      >
        <div className="border-border-subtle flex items-center justify-between border-b px-2 py-1">
          <TabSwitcher
            ariaLabel="Output"
            tabs={OUTPUT_TABS}
            value={tab}
            onChange={setTab}
          />
          <ShareButton
            spec={spec}
            messages={chatMessages}
            isStreaming={isStreaming}
          />
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div hidden={tab !== 'preview'} className="h-full">
            <PreviewFrame spec={spec} />
          </div>
          <div hidden={tab !== 'code'} className="h-full overflow-auto">
            <CodePanel spec={spec} />
          </div>
        </div>
      </section>
    </>
  );
};
