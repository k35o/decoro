'use client';

import {
  type Spec,
  applySpecPatch,
  createMixedStreamParser,
} from '@json-render/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversationRecord } from './conversation-types.ts';
import type { StreamEvent } from './stream-events.ts';

export type DecoroMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type Options = {
  /**
   * Endpoint that mints (or attaches to) a conversation and starts the
   * server-side LLM job. POSTed to once per turn.
   */
  api: string;
  /**
   * Endpoint base for the server-sent events stream that delivers
   * in-flight chunks. Pass `null` to disable subscription (e.g. tests).
   */
  eventsApi?: string | null;
  /**
   * Optional seed for the chat state. Used when continuing from a shared
   * snapshot or resuming a conversation from the sidebar.
   */
  initialState?: { messages: DecoroMessage[]; spec: Spec | null } | null;
  /**
   * Existing conversation row id. When set, the EventSource attaches
   * immediately so an in-flight server-side job (started by another
   * tab, or this tab before a refresh) replays + streams live.
   */
  initialConversationId?: string | null;
  /**
   * Fires once when the first POST mints a new conversation row. Used
   * by the shell to update the URL (`?conversation=<id>`) so a refresh
   * keeps the user on the same conversation.
   */
  onConversationCreated?: (id: string) => void;
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

const buildEmptySpec = (): Spec => ({ root: '', elements: {} });

const cloneSpec = (spec: Spec | null): Spec => {
  if (!spec) return buildEmptySpec();
  return {
    root: spec.root,
    elements: { ...spec.elements },
    ...(spec.state ? { state: { ...spec.state } } : {}),
  };
};

/**
 * Decoro's chat hook. The LLM stream lives on the server (per ADR-016);
 * this hook submits a turn via `POST /api/generate` and consumes the
 * resulting stream over `EventSource('/api/conversations/<id>/events')`.
 *
 * Lifecycle:
 *   - On mount with `initialConversationId`: open EventSource right
 *     away. If a job is already running on the server (another tab,
 *     pre-refresh state), the SSE channel replays the buffer and then
 *     streams live. Otherwise the SSE handler emits `done` immediately
 *     and the hook stays idle.
 *   - On `send`: optimistically append the user message + an empty
 *     assistant placeholder, POST `/api/generate`, then rely on the
 *     EventSource to deliver the stream.
 *   - On `chunk`: feed the bytes to `createMixedStreamParser`. Prose
 *     tokens grow the assistant placeholder; JSON patches update the
 *     spec.
 *   - On `done`: stop streaming. The DB has the final state; we leave
 *     local state alone (it already mirrors the parsed buffer).
 */
export const useDecoroChat = ({
  api,
  eventsApi = '/api/conversations',
  initialState = null,
  initialConversationId = null,
  onConversationCreated,
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
  const messagesRef = useRef<DecoroMessage[]>(state.messages);
  messagesRef.current = state.messages;
  const specRef = useRef<Spec | null>(state.spec);
  specRef.current = state.spec;
  const conversationIdRef = useRef<string | null>(initialConversationId);
  const onCreatedRef = useRef(onConversationCreated);
  onCreatedRef.current = onConversationCreated;

  // Track the current assistant placeholder + working spec so chunks
  // for the active turn land in the right places. These are recreated
  // on every `start` event so a server-side cancellation (a fresh turn
  // supersedes the previous one) cleanly resets the parser.
  const turnRef = useRef<{
    turnId: string | null;
    assistantId: string | null;
    // The spec as it was BEFORE this turn — re-seed point when a `sync`
    // re-delivers the full buffer so patches re-apply once, not on top of
    // a half-built spec.
    baseline: Spec;
    working: Spec;
    parser: ReturnType<typeof createMixedStreamParser> | null;
  }>({
    turnId: null,
    assistantId: null,
    baseline: buildEmptySpec(),
    working: buildEmptySpec(),
    parser: null,
  });

  /**
   * Build (or, when `forceReset`, rebuild) the parsing context for `turnId`.
   *
   * - Live `chunk`: call with `forceReset = false` — reuses the existing
   *   parser/message so deltas append.
   * - Full-buffer `sync` (a (re)connecting subscriber): call with
   *   `forceReset = true` — clears the turn's assistant message + re-seeds
   *   the working spec from the pre-turn baseline, then the caller re-pushes
   *   the whole buffer. This makes reconnects idempotent: the chat text and
   *   spec rebuild from scratch instead of the buffer being appended again.
   */
  const ensureTurn = useCallback((turnId: string, forceReset: boolean) => {
    const existing = turnRef.current;
    const sameTurn = existing.turnId === turnId;
    if (sameTurn && existing.parser && !forceReset) return;
    // Capture the pre-turn baseline once per turn; keep it across resets.
    const baseline = sameTurn ? existing.baseline : cloneSpec(specRef.current);
    let assistantId = sameTurn ? existing.assistantId : null;
    setState((prev) => {
      if (assistantId !== null) {
        // Reuse this turn's bubble; clear it so a re-sync re-parses cleanly.
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantId ? { ...m, text: '' } : m,
          ),
          isStreaming: true,
          error: null,
        };
      }
      // Re-use the trailing empty assistant placeholder if the user's own
      // send() already inserted one in this tab; otherwise (attaching to a
      // server-side job from another tab / after refresh) insert our own.
      const last = prev.messages.at(-1);
      if (last?.role === 'assistant' && last.text === '') {
        assistantId = last.id;
        return { ...prev, isStreaming: true, error: null };
      }
      const id = crypto.randomUUID();
      assistantId = id;
      return {
        ...prev,
        messages: [...prev.messages, { id, role: 'assistant', text: '' }],
        isStreaming: true,
        error: null,
      };
    });
    const working = cloneSpec(baseline);
    const parser = createMixedStreamParser({
      onText(chunk) {
        const id = assistantId;
        if (id === null) return;
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === id ? { ...m, text: m.text + chunk } : m,
          ),
        }));
      },
      onPatch(patch) {
        applySpecPatch(working, patch);
        setState((prev) => ({
          ...prev,
          spec: cloneSpec(working),
        }));
      },
    });
    turnRef.current = { turnId, assistantId, baseline, working, parser };
  }, []);

  // EventSource lifecycle. Re-subscribe whenever the conversation id
  // changes (sidebar pick, fork, new chat). The EventSource itself
  // auto-reconnects on transient network errors; we only manually open
  // / close on conversation switches.
  useEffect(() => {
    const conversationId = conversationIdRef.current;
    if (
      conversationId === null ||
      conversationId === '' ||
      eventsApi === null ||
      eventsApi === ''
    ) {
      return undefined;
    }
    const source = new EventSource(`${eventsApi}/${conversationId}/events`);
    const handler = (ev: MessageEvent<string>) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(ev.data) as StreamEvent;
      } catch {
        return;
      }
      if (event.type === 'start') {
        // Fresh turn started server-side. Mark it + snapshot the pre-turn
        // baseline; the placeholder + parser are built lazily on the first
        // `sync` / `chunk` for the turn.
        turnRef.current = {
          turnId: event.turnId,
          assistantId: null,
          baseline: cloneSpec(specRef.current),
          working: buildEmptySpec(),
          parser: null,
        };
        setState((prev) => ({ ...prev, isStreaming: true, error: null }));
        return;
      }
      if (event.type === 'sync') {
        // Full-buffer replay for a (re)connecting subscriber: rebuild the
        // turn from scratch so reconnects don't duplicate the text / spec.
        ensureTurn(event.turnId, true);
        turnRef.current.parser?.push(event.text);
        return;
      }
      if (event.type === 'chunk') {
        ensureTurn(event.turnId, false);
        turnRef.current.parser?.push(event.text);
        return;
      }
      if (event.type === 'done') {
        turnRef.current.parser?.flush();
        setState((prev) => ({ ...prev, isStreaming: false }));
        // Don't tear down the EventSource — leaving it open lets the
        // next turn (in this conversation) attach instantly. The server
        // emits a synthetic `done` for idle conversations on subscribe,
        // so re-opening would be cheap, but staying open is cheaper.
        return;
      }
      // Remaining variant is `error` (the event union is exhausted by
      // the earlier returns); narrowing makes lint think the explicit
      // check is redundant, so we destructure unconditionally.
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: new Error(event.message),
      }));
    };
    source.addEventListener('message', handler);
    source.addEventListener('error', () => {
      // EventSource auto-reconnects on transient errors. If the
      // connection is permanently closed (server gone), the readyState
      // becomes CLOSED and no further events arrive.
    });
    return () => {
      source.removeEventListener('message', handler);
      source.close();
    };
    // We deliberately depend on `conversationIdRef.current` indirectly
    // via the `state.messages.length === 0` heuristic re-run trigger
    // below — but the cleanest is to re-run when the active id changes.
    // Read it from the ref so a value change forces a re-effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref read is intentional
  }, [eventsApi, ensureTurn, conversationIdRef.current]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: DecoroMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
      };
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

      // Snapshot what the API needs from refs (post-render values).
      // The trailing empty assistant placeholder is sent through too —
      // the server filters it before calling the LLM but uses it as
      // the placeholder anchor for the assistant turn.
      const messagesForApi = [
        ...messagesRef.current,
        userMsg,
        { id: assistantId, role: 'assistant' as const, text: '' },
      ];
      const specForApi = specRef.current ?? buildEmptySpec();

      try {
        const res = await fetch(api, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            conversationId: conversationIdRef.current,
            messages: messagesForApi,
            spec: specForApi,
          }),
        });
        if (!res.ok) {
          let message = `HTTP ${res.status.toString()}`;
          try {
            const data = (await res.json()) as {
              message?: string;
              error?: string;
            };
            message = data.message ?? data.error ?? message;
          } catch {
            // body wasn't JSON
          }
          throw new Error(message);
        }
        const data = (await res.json()) as { conversationId: string };
        if (conversationIdRef.current === null) {
          conversationIdRef.current = data.conversationId;
          onCreatedRef.current?.(data.conversationId);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, isStreaming: false, error }));
      }
    },
    [api],
  );

  const clear = useCallback(() => {
    conversationIdRef.current = null;
    turnRef.current = {
      turnId: null,
      assistantId: null,
      baseline: buildEmptySpec(),
      working: buildEmptySpec(),
      parser: null,
    };
    setState(emptyState);
  }, []);

  return {
    ...state,
    conversationId: conversationIdRef.current,
    send,
    clear,
  };
};

/**
 * Helper consumed by HomeShell to seed the hook from a `ConversationRecord`
 * fetched from `/api/conversations/[id]`. Centralizes the type-cast so
 * we don't repeat the `as` shape in every caller.
 */
export const seedFromConversation = (
  record: ConversationRecord,
): { messages: DecoroMessage[]; spec: Spec | null } => ({
  messages: record.messages,
  spec: record.spec as unknown as Spec,
});
