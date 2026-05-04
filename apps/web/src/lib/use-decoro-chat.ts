'use client';

import {
  type Spec,
  applySpecPatch,
  createMixedStreamParser,
} from '@json-render/core';
import { useCallback, useRef, useState } from 'react';

export type DecoroMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type Options = {
  api: string;
  /**
   * Persistence endpoint base. The hook POSTs once to `${persistApi}` to
   * mint a conversation row on the first stream completion, then PATCHes
   * `${persistApi}/<id>` on every subsequent assistant turn. Pass `null`
   * to disable persistence (e.g. demo / test contexts).
   */
  persistApi?: string | null;
  /**
   * Optional seed for the chat state. Used when continuing from a shared
   * snapshot or resuming a conversation from the sidebar. When supplied,
   * `conversationId` should also be set so subsequent saves PATCH the
   * existing row instead of creating a new one.
   */
  initialState?: { messages: DecoroMessage[]; spec: Spec | null } | null;
  /**
   * Existing conversation row id. When set, the first assistant-turn
   * save is a PATCH (instead of POST). Forks from a shared snapshot
   * leave this unset — the first save then creates a brand-new row.
   */
  initialConversationId?: string | null;
};

type State = {
  messages: DecoroMessage[];
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
};

const emptyState: State = {
  messages: [],
  spec: null,
  isStreaming: false,
  error: null,
};

/**
 * Decoro's chat hook. Wraps the json-render building blocks
 * (`createMixedStreamParser` + `applySpecPatch`) so we can also send the
 * `currentSpec` alongside the message history — `useChatUI` from
 * `@json-render/react` is otherwise a perfect fit but its request body is
 * locked to `{ messages }`, which prevents the iteration loop M8 needs.
 *
 * Persistence (per ADR-015): when `persistApi` is set, the hook saves
 * the conversation to Postgres after each assistant turn completes. The
 * first save POSTs to mint a new row; subsequent saves PATCH the same id.
 * Failures are logged but never break the chat experience — losing a
 * single auto-save is annoying but recoverable, while propagating the
 * error to the UI would interrupt a working stream for a background
 * concern.
 */
export const useDecoroChat = ({
  api,
  persistApi = '/api/conversations',
  initialState = null,
  initialConversationId = null,
}: Options) => {
  const [state, setState] = useState<State>(() =>
    initialState
      ? {
          messages: initialState.messages,
          spec: initialState.spec,
          isStreaming: false,
          error: null,
        }
      : emptyState,
  );
  const messagesRef = useRef<DecoroMessage[]>([]);
  messagesRef.current = state.messages;
  const specRef = useRef<Spec | null>(null);
  specRef.current = state.spec;
  const abortRef = useRef<AbortController | null>(null);
  // The conversation row id grows out-of-band from React state — once
  // assigned by the first POST, every subsequent save needs the same id
  // even across renders that haven't committed yet. A ref keeps it
  // synchronously available without forcing a re-render that doesn't
  // change anything visible.
  const conversationIdRef = useRef<string | null>(initialConversationId);

  const persist = useCallback(
    async (messages: DecoroMessage[], spec: Spec | null) => {
      if (persistApi === null || persistApi === '') return;
      // Guard against persisting before the first turn fully resolves.
      // A null spec from an aborted-mid-stream save would round-trip as
      // an invalid record; skip those.
      if (!spec || spec.root === '') return;
      try {
        const body = JSON.stringify({ messages, spec });
        if (conversationIdRef.current === null) {
          const res = await fetch(persistApi, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          });
          if (!res.ok) throw new Error(`POST ${res.status.toString()}`);
          const data = (await res.json()) as { id: string };
          conversationIdRef.current = data.id;
          return;
        }
        const res = await fetch(`${persistApi}/${conversationIdRef.current}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(`PATCH ${res.status.toString()}`);
      } catch (err) {
        // Auto-save failure is a background concern; log it but keep
        // the chat alive. The user's in-memory state is still good and
        // the next turn will retry.
        console.warn('[useDecoroChat] persist failed:', err);
      }
    },
    [persistApi],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const userMsg: DecoroMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
      };
      // Append the assistant placeholder up front so prose tokens streamed in
      // via `onText` (the LLM's 1-line summary, see api/generate route) can
      // grow it character-by-character. Previously the assistant entry was
      // appended *after* the stream completed and always carried empty text,
      // so the chat pane fell back to a "rendered →" marker.
      const assistantId = crypto.randomUUID();
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          userMsg,
          { id: assistantId, role: 'assistant', text: '' },
        ],
        isStreaming: true,
        error: null,
      }));

      const messagesForApi = [...messagesRef.current, userMsg].map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const working: Spec = specRef.current
        ? structuredClone(specRef.current)
        : { root: '', elements: {} };
      const parser = createMixedStreamParser({
        onPatch(patch) {
          applySpecPatch(working, patch);
          setState((prev) => ({
            ...prev,
            spec: {
              root: working.root,
              elements: { ...working.elements },
              ...(working.state ? { state: { ...working.state } } : {}),
            },
          }));
        },
        onText(chunk) {
          // The system prompt tells the model to emit one short prose line
          // before the JSONL patches (see api/generate route). Append the
          // chunk to the assistant placeholder so the chat pane reflects the
          // model's running summary as it streams in.
          setState((prev) => ({
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === assistantId ? { ...m, text: m.text + chunk } : m,
            ),
          }));
        },
      });

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: messagesForApi,
            currentSpec: specRef.current,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          let message = `HTTP ${response.status.toString()}`;
          try {
            const data = (await response.json()) as {
              message?: string;
              error?: string;
            };
            message = data.message ?? data.error ?? message;
          } catch {
            // body wasn't JSON
          }
          throw new Error(message);
        }

        for await (const chunk of response.body.pipeThrough(
          new TextDecoderStream(),
        )) {
          parser.push(chunk);
        }
        parser.flush();

        setState((prev) => ({ ...prev, isStreaming: false }));
        // Fire-and-forget the auto-save now that the stream has settled.
        // Reads from refs to capture the latest state without depending on
        // a re-render landing first.
        void persist(messagesRef.current, specRef.current);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, isStreaming: false, error }));
      }
    },
    [api, persist],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    conversationIdRef.current = null;
    setState(emptyState);
  }, []);

  return {
    ...state,
    conversationId: conversationIdRef.current,
    send,
    clear,
  };
};
