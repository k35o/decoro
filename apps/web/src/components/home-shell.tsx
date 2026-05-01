'use client';

import { useChatUI } from '@json-render/react';
import { Heading } from '@k8o/arte-odyssey';

import { type ChatMessage, ChatPane } from './chat-pane.tsx';
import { PreviewFrame } from './preview-frame.tsx';

/**
 * Top-level client shell for `/`. Wires the chat pane (user prompts) to
 * `useChatUI` (which posts `{messages}` to /api/generate, parses the
 * incremental json-render patch stream embedded in AI SDK's UI message
 * stream, and exposes one Spec per assistant turn) and forwards the latest
 * Spec into the iframe via PreviewFrame.
 */
export const HomeShell = () => {
  const { messages, isStreaming, error, send } = useChatUI({
    api: '/api/generate',
  });

  const latestSpec =
    [...messages]
      .toReversed()
      .find((m) => m.role === 'assistant' && m.spec !== null)?.spec ?? null;

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
            <PreviewFrame spec={latestSpec} />
          </div>
        </section>
      </div>
    </div>
  );
};
