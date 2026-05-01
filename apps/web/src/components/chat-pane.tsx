'use client';

import { Button, Heading } from '@k8o/arte-odyssey';
import { useState } from 'react';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type Props = {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  onSubmit: (prompt: string) => void;
};

/**
 * Left-pane chat input + transcript. Messages come straight from `useChatUI`
 * upstream — assistant entries currently have empty `text` because our prompt
 * tells the LLM to emit only JSONL patches (the spec, rendered in the iframe,
 * is the assistant's "answer").
 */
export const ChatPane = ({ messages, isStreaming, error, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('');

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;
    setPrompt('');
    onSubmit(trimmed);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Heading type="h2">Chat</Heading>
      <ul
        className="flex-1 space-y-2 overflow-y-auto"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <li className="text-fg-mute text-sm">
            Try “build a primary submit button” or “a card with two buttons
            inside”.
          </li>
        ) : (
          messages.map((msg) =>
            msg.role === 'user' ? (
              <li
                key={msg.id}
                className="bg-bg-surface rounded px-3 py-2 text-sm"
              >
                {msg.text}
              </li>
            ) : (
              <li key={msg.id} className="text-fg-mute pl-3 text-xs italic">
                rendered →
              </li>
            ),
          )
        )}
        {isStreaming ? (
          <li className="text-fg-mute text-sm italic">Generating…</li>
        ) : null}
        {error ? (
          <li
            className="border-fg-mute text-fg-mute rounded border px-3 py-2 text-sm"
            role="alert"
          >
            {error.message}
          </li>
        ) : null}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Describe what you want…"
          rows={3}
          disabled={isStreaming}
          className="border-border-mute flex-1 rounded border p-2 text-sm"
        />
        <Button type="submit" disabled={isStreaming || !prompt.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
};
