'use client';

import type { Spec } from '@json-render/core';

import type { ChatMessage } from '../lib/chat-types.ts';
import { type DecoroMessage, useDecoroChat } from '../lib/use-decoro-chat.ts';
import { usePreviewBroadcast } from '../lib/use-preview-broadcast.ts';
import { ChatPane } from './chat-pane.tsx';
import { OutputPanel } from './output-panel.tsx';

export type WorkspaceSeed = {
  initialState: { messages: DecoroMessage[]; spec: Spec | null } | null;
  conversationId: string | null;
};

type Props = {
  seed: WorkspaceSeed;
  /**
   * Forwarded to the chat hook. Fires once when the first save mints a
   * new conversation row — the parent updates the URL so a refresh
   * lands on the same conversation.
   */
  onConversationCreated: (id: string) => void;
};

/**
 * The chat + output composite. Re-mounts (via `key` from the parent)
 * whenever the seed changes, so `useDecoroChat`'s `useState` initializer
 * picks up the new initial messages / spec / conversationId without
 * needing a manual reset path on the hook.
 */
export const HomeWorkspace = ({ seed, onConversationCreated }: Props) => {
  const { messages, spec, isStreaming, error, send } = useDecoroChat({
    api: '/api/generate',
    initialState: seed.initialState,
    initialConversationId: seed.conversationId,
    onConversationCreated,
  });

  // Broadcast spec changes on the preview channel so any popped-out
  // window stays in sync with the embedded iframe.
  usePreviewBroadcast(spec);

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
      <OutputPanel
        spec={spec}
        chatMessages={chatMessages}
        isStreaming={isStreaming}
      />
    </>
  );
};
