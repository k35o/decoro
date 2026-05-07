'use client';

import {
  Alert,
  Button,
  CloseIcon,
  IconButton,
  InteractiveCard,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  Spinner,
} from '@k8o/arte-odyssey';
import { useRef, useState } from 'react';

import { adapter } from '../../decoro.config.ts';
import {
  type ChatMessage,
  type ImageAttachment,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from '../lib/chat-types.ts';
import {
  AttachmentTooLargeError,
  UnsupportedAttachmentTypeError,
  compressAll,
} from '../lib/image-compress.ts';

type Props = {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  onSubmit: (prompt: string, attachments?: ImageAttachment[]) => void;
};

const EXAMPLE_PROMPTS = [
  'A primary submit button labeled "Save"',
  'A card with two buttons inside',
  'A sign-in form (email + password) with a submit button',
  'A pricing card with a "Recommended" badge',
];

const filesFromDataTransfer = (
  items: DataTransferItemList | null,
  files: FileList | null,
): File[] => {
  const out: File[] = [];
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file === null) continue;
      if (file.type.startsWith('image/')) out.push(file);
    }
  }
  if (out.length === 0 && files) {
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) out.push(file);
    }
  }
  return out;
};

/**
 * Left-pane chat input + transcript. Owns the in-flight compose state
 * (prompt text + pending attachments) and forwards completed turns
 * upstream via `onSubmit`. Image input arrives three ways: paste from
 * clipboard, drag-and-drop onto the textarea, and a file picker
 * button. All three funnel through `compressAll` so the data URI ends
 * up under the conversation row size budget.
 */
export const ChatPane = ({ messages, isStreaming, error, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [composeError, setComposeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEmpty = messages.length === 0;
  const remainingSlots = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;

  const ingestFiles = async (files: readonly File[]) => {
    if (files.length === 0) return;
    if (remainingSlots <= 0) {
      setComposeError(
        `Up to ${MAX_ATTACHMENTS_PER_MESSAGE.toString()} images per message.`,
      );
      return;
    }
    const accepted = files.slice(0, remainingSlots);
    setComposeError(null);
    try {
      const next = await compressAll(accepted);
      setAttachments((prev) => [...prev, ...next]);
    } catch (err) {
      if (
        err instanceof AttachmentTooLargeError ||
        err instanceof UnsupportedAttachmentTypeError
      ) {
        setComposeError(err.message);
      } else {
        setComposeError(
          err instanceof Error ? err.message : 'Failed to read image',
        );
      }
    }
  };

  const submit = () => {
    const trimmed = prompt.trim();
    if (isStreaming) return;
    if (!trimmed && attachments.length === 0) return;
    onSubmit(trimmed, attachments.length === 0 ? undefined : attachments);
    setPrompt('');
    setAttachments([]);
    setComposeError(null);
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
                  <div className="bg-primary-bg-mute text-fg-base flex max-w-[85%] flex-col gap-2 rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
                    {msg.attachments && msg.attachments.length > 0 ? (
                      <MessageAttachments attachments={msg.attachments} />
                    ) : null}
                    {msg.text === '' ? null : <span>{msg.text}</span>}
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
        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
            {attachments.map((a) => (
              <li key={a.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI, no remote optimization */}
                <img
                  src={a.dataUri}
                  alt=""
                  className="border-border-subtle size-16 rounded-md border object-cover"
                />
                <span className="absolute -top-2 -right-2">
                  <IconButton
                    label="Remove attachment"
                    size="sm"
                    bg="base"
                    onAction={() => {
                      setAttachments((prev) =>
                        prev.filter((p) => p.id !== a.id),
                      );
                    }}
                  >
                    <CloseIcon size="sm" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {composeError === null || composeError === '' ? null : (
          <p className="text-fg-mute mb-2 text-xs" role="alert">
            {composeError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
            }}
            onPaste={(e) => {
              const files = filesFromDataTransfer(
                e.clipboardData.items,
                e.clipboardData.files,
              );
              if (files.length > 0) {
                e.preventDefault();
                void ingestFiles(files);
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              const files = filesFromDataTransfer(
                e.dataTransfer.items,
                e.dataTransfer.files,
              );
              if (files.length > 0) {
                e.preventDefault();
                void ingestFiles(files);
              }
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
            disabled={
              isStreaming || (!prompt.trim() && attachments.length === 0)
            }
            startIcon={<SendIcon size="sm" />}
          >
            Send
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) {
              void ingestFiles(files);
            }
            e.target.value = '';
          }}
        />
        <div className="text-fg-subtle mt-2 flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            disabled={isStreaming || remainingSlots <= 0}
            onClick={() => {
              fileInputRef.current?.click();
            }}
            className="text-fg-mute hover:text-fg-base disabled:text-fg-subtle inline-flex items-center gap-1 disabled:cursor-not-allowed"
          >
            <PlusIcon size="sm" />
            <span>Attach image</span>
          </button>
          <span>⌘ + Enter to send · or paste / drop</span>
        </div>
      </form>
    </div>
  );
};

const MessageAttachments = ({
  attachments,
}: {
  attachments: ImageAttachment[];
}) => (
  <ul
    className="flex flex-wrap gap-1.5"
    style={{ listStyle: 'none', padding: 0, margin: 0 }}
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
            width={96}
            height={96}
            style={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              borderRadius: 6,
              display: 'block',
            }}
          />
        </a>
      </li>
    ))}
  </ul>
);

const EmptyState = ({ onPick }: { onPick: (text: string) => void }) => (
  <div className="flex h-full flex-col gap-4">
    <p className="text-fg-mute text-sm">
      Describe a UI in plain language. Decoro turns it into{' '}
      {adapter.metadata.displayName} components — preview live, copy as TSX. Try
      one of these to start:
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
