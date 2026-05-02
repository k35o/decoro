'use client';

import {
  Alert,
  Button,
  InteractiveCard,
  SendIcon,
  SparklesIcon,
  Spinner,
} from '@k8o/arte-odyssey';
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

const EXAMPLE_PROMPTS = [
  'A primary submit button labeled "Save"',
  'A card with two buttons inside',
  'A sign-in form (email + password) with a submit button',
  'A pricing card with a "Recommended" badge',
];

/**
 * Left-pane chat input + transcript. Messages come straight from `useChatUI`
 * upstream — assistant entries currently have empty `text` because our prompt
 * tells the LLM to emit only JSONL patches (the spec, rendered in the iframe,
 * is the assistant's "answer").
 */
export const ChatPane = ({ messages, isStreaming, error, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('');
  const isEmpty = messages.length === 0;

  const submit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;
    setPrompt('');
    onSubmit(trimmed);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-border-subtle flex items-center gap-2 border-b px-5 py-3">
        <span className="text-primary-fg" aria-hidden="true">
          <SparklesIcon size="sm" />
        </span>
        <h2 className="text-fg-base text-sm font-medium">Chat</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isEmpty ? (
          <EmptyState
            onPick={(text) => {
              setPrompt(text);
            }}
          />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Conversation">
            {messages.map((msg) =>
              msg.role === 'user' ? (
                <li key={msg.id} className="flex justify-end">
                  <div className="bg-primary-bg-mute text-fg-base max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
                    {msg.text}
                  </div>
                </li>
              ) : (
                <li key={msg.id} className="flex justify-start">
                  {msg.text === '' ? (
                    isStreaming ? (
                      <span
                        className="text-fg-mute inline-flex items-center gap-2 px-1 py-2 text-xs"
                        aria-live="polite"
                      >
                        <Spinner size="sm" />
                        <span>Generating…</span>
                      </span>
                    ) : null
                  ) : (
                    <div className="bg-bg-subtle text-fg-base max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2 text-sm">
                      {msg.text}
                    </div>
                  )}
                </li>
              ),
            )}
            {error ? (
              <li>
                <Alert status="error" message={error.message} />
              </li>
            ) : null}
          </ul>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-border-subtle border-t px-5 py-4"
      >
        <div className="flex items-end gap-2">
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
            placeholder="Describe what you want to build…"
            rows={3}
            disabled={isStreaming}
            aria-label="Prompt"
            className="border-border-base bg-bg-base focus-visible:ring-border-info disabled:bg-bg-mute flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus-visible:border-transparent focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed"
          />
          <Button
            type="submit"
            disabled={isStreaming || !prompt.trim()}
            startIcon={<SendIcon size="sm" />}
          >
            Send
          </Button>
        </div>
        <p className="text-fg-subtle mt-2 text-xs">⌘ + Enter to send</p>
      </form>
    </div>
  );
};

const EmptyState = ({ onPick }: { onPick: (text: string) => void }) => (
  <div className="flex h-full flex-col gap-4">
    <p className="text-fg-mute text-sm">
      Describe a UI in plain language. Decoro turns it into ArteOdyssey
      components — preview live, copy as TSX. Try one of these to start:
    </p>
    <ul className="grid gap-2">
      {EXAMPLE_PROMPTS.map((example) => (
        <li key={example}>
          <button
            type="button"
            onClick={() => {
              onPick(example);
            }}
            className="block w-full text-left"
          >
            <InteractiveCard appearance="bordered">
              <p className="text-fg-base px-4 py-3 text-sm">{example}</p>
            </InteractiveCard>
          </button>
        </li>
      ))}
    </ul>
  </div>
);
