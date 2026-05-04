'use client';

import { CloseIcon, IconButton, PlusIcon, Spinner } from '@k8o/arte-odyssey';
import { useCallback, useEffect, useState } from 'react';

import type { ConversationSummary } from '../lib/conversation-types.ts';

type Props = {
  activeId: string | null;
  onPickConversation: (id: string) => void;
  onNewConversation: () => void;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; conversations: ConversationSummary[] }
  | { kind: 'error'; message: string };

/**
 * Persistent left rail showing the team's conversation history.
 *
 * The list re-fetches on mount, when the active id changes (the parent
 * just persisted a turn), and when the user deletes a row. There's no
 * websocket / SSE-based live update: the sidebar reflects what THIS
 * browser has done, plus whatever was on disk at last fetch.
 *
 * Failing requests don't take the chat down with them — the sidebar
 * shows an inline error and the chat keeps running.
 */
export const ConversationsSidebar = ({
  activeId,
  onPickConversation,
  onNewConversation,
}: Props) => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error(`HTTP ${res.status.toString()}`);
      const data = (await res.json()) as {
        conversations: ConversationSummary[];
      };
      setState({ kind: 'ok', conversations: data.conversations });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to load',
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, activeId]);

  const onDelete = useCallback(
    async (id: string) => {
      // Native confirm — we deliberately keep destructive interactions
      // chunky so a stray click can't blow away a teammate's work.
      const ok = window.confirm(
        'Delete this conversation? This cannot be undone.',
      );
      if (!ok) return;
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`HTTP ${res.status.toString()}`);
        }
        if (id === activeId) onNewConversation();
        await refresh();
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    },
    [activeId, onNewConversation, refresh],
  );

  return (
    <aside className="bg-bg-base flex h-full w-64 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="border-border-subtle flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-fg-base text-sm font-medium">Conversations</h2>
        <IconButton
          label="New conversation"
          size="sm"
          bg="transparent"
          onAction={onNewConversation}
        >
          <PlusIcon size="sm" />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {state.kind === 'loading' ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : state.kind === 'error' ? (
          <p className="text-fg-mute px-2 py-2 text-xs" role="alert">
            {state.message}
          </p>
        ) : state.conversations.length === 0 ? (
          <p className="text-fg-mute px-2 py-2 text-xs">
            No saved conversations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {state.conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id} className="group/row relative">
                  <button
                    type="button"
                    onClick={() => {
                      onPickConversation(c.id);
                    }}
                    className={`block w-full rounded-md px-3 py-2 pr-8 text-left text-sm ${
                      isActive
                        ? 'bg-bg-subtle text-fg-base'
                        : 'text-fg-base hover:bg-bg-subtle/60'
                    }`}
                  >
                    <span className="line-clamp-2 break-words">{c.title}</span>
                  </button>
                  <span className="absolute top-1 right-1 opacity-0 group-hover/row:opacity-100">
                    <IconButton
                      label="Delete conversation"
                      size="sm"
                      bg="transparent"
                      onAction={() => {
                        void onDelete(c.id);
                      }}
                    >
                      <CloseIcon size="sm" />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};
