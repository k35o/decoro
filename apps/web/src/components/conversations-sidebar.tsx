'use client';

import { CloseIcon, IconButton, PlusIcon, Spinner } from '@k8o/arte-odyssey';
import { useCallback, useEffect, useRef, useState } from 'react';

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
const ACTIVE_POLL_INTERVAL_MS = 2000;

export const ConversationsSidebar = ({
  activeId,
  onPickConversation,
  onNewConversation,
}: Props) => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [activeJobs, setActiveJobs] = useState<ReadonlySet<string>>(new Set());

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

  // Poll the active-jobs endpoint so the sidebar shows a spinner on
  // any conversation currently generating in the background — including
  // ones the operator isn't looking at right now (a turn started
  // pre-navigation, or a teammate's in-flight stream). Cheap: in-memory
  // lookup, no DB hit per poll.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/conversations/active');
        if (!res.ok) return;
        const data = (await res.json()) as { conversationIds: string[] };
        if (cancelled) return;
        setActiveJobs(new Set(data.conversationIds));
      } catch {
        // Silent — the spinner not appearing is a reasonable failure.
      }
    };
    void poll();
    const handle = setInterval(() => {
      void poll();
    }, ACTIVE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  // Refresh the conversation list whenever a job finishes (an id
  // disappeared from the active set). Newly-completed conversations
  // need their title / updated_at re-pulled so the sidebar rises to
  // the top.
  const previousActiveRef = useRef<ReadonlySet<string>>(activeJobs);
  useEffect(() => {
    const prev = previousActiveRef.current;
    const completed = [...prev].some((id) => !activeJobs.has(id));
    if (completed) void refresh();
    previousActiveRef.current = activeJobs;
  }, [activeJobs, refresh]);

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
              const isGenerating = activeJobs.has(c.id);
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
                    <span className="flex items-start gap-2">
                      {isGenerating ? (
                        <span
                          className="text-fg-mute mt-0.5 shrink-0"
                          aria-label="Generating"
                          title="Generating"
                        >
                          <Spinner size="sm" />
                        </span>
                      ) : null}
                      <span className="line-clamp-2 break-words">
                        {c.title}
                      </span>
                    </span>
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
