'use client';

import { Heading } from '@k8o/arte-odyssey';

import { useDecoroChat } from '../lib/use-decoro-chat.ts';
import { type ChatMessage, ChatPane } from './chat-pane.tsx';
import { CodePanel } from './code-panel.tsx';
import { PreviewFrame } from './preview-frame.tsx';

/**
 * Top-level client shell for `/`. Wires the chat pane to `useDecoroChat`,
 * which posts `{ messages, currentSpec }` to /api/generate so each follow-up
 * iterates on the existing spec instead of regenerating from scratch (M8).
 *
 * The right pane is split vertically: live preview (top) and the generated
 * TSX (bottom, M9). Both update on every spec patch.
 */
export const HomeShell = () => {
  const { messages, spec, isStreaming, error, send } = useDecoroChat({
    api: '/api/generate',
  });

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
  }));

  return (
    <div className="bg-bg-base text-fg-base flex h-dvh flex-col">
      <header className="border-border-mute border-b px-6 py-4">
        <Heading type="h1">Decoro</Heading>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <section
          aria-label="Chat"
          className="border-border-mute w-1/2 border-r"
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
          aria-label="Preview"
          className="flex w-1/2 flex-col overflow-hidden"
        >
          <div className="border-border-mute border-b px-6 py-4">
            <Heading type="h2">Preview</Heading>
          </div>
          <div className="flex-1 overflow-hidden">
            <PreviewFrame spec={spec} />
          </div>
          <div className="border-border-mute border-t px-6 py-4">
            <Heading type="h2">Code</Heading>
          </div>
          <div className="bg-bg-surface h-1/3 overflow-auto">
            <CodePanel spec={spec} />
          </div>
        </section>
      </div>
    </div>
  );
};
