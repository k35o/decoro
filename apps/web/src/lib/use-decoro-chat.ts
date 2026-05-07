'use client';

import {
  type Spec,
  applySpecPatch,
  createMixedStreamParser,
} from '@json-render/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatMessage, ImageAttachment } from './chat-types.ts';
import type { ConversationRecord } from './conversation-types.ts';
import type { StreamEvent } from './stream-events.ts';

/**
 * In-process chat message shape. Aliased to `ChatMessage` so the hook
 * and the wire format stay in lockstep (attachments included). Kept
 * as a distinct export for callers that already import this type
 * from the hook module.
 */
export type DecoroMessage = ChatMessage;

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

/**
 * Strip JSON-patch-shaped tail from a prose chunk.
 *
 * `createMixedStreamParser` splits by newline: clean
 * `prose\n{patch}\n` streams into onText / onPatch correctly. When the
 * model emits prose and JSON on the same line (no newline between),
 * the entire run lands in onText and the chat bubble fills with
 * `{"op":"add",...}` gibberish even though the rendered preview is
 * fine (other patches still parsed).
 *
 * Truncate at the first `{"op|path|value|type":` sentinel — anything
 * before it is the legitimate prose preamble; anything after it is
 * the malformed-JSON tail the parser gave up on. Returns '' when
 * nothing is left.
 */
const stripPatchJson = (chunk: string): string => {
  const match = /\{\s*"(?:op|path|value|type)"\s*:/.exec(chunk);
  if (!match) return chunk;
  return chunk.slice(0, match.index);
};

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
    working: Spec;
    parser: ReturnType<typeof createMixedStreamParser> | null;
  }>({
    turnId: null,
    assistantId: null,
    working: buildEmptySpec(),
    parser: null,
  });

  const ensureTurnContext = useCallback((turnId: string) => {
    const existing = turnRef.current;
    if (existing.turnId === turnId && existing.parser) return;
    // New turn (or first chunk for this connection). Build an empty
    // assistant placeholder if one isn't already present, and reset
    // the parser around a fresh working spec seeded from current state.
    let assistantId: string | null = null;
    setState((prev) => {
      // Re-use the trailing empty assistant placeholder if the user's
      // own send() already inserted one in this same browser tab.
      const last = prev.messages.at(-1);
      if (last?.role === 'assistant' && last.text === '') {
        assistantId = last.id;
        return prev;
      }
      // Otherwise this stream came from another tab / a server-side
      // job we're just attaching to. Insert a placeholder of our own.
      const id = crypto.randomUUID();
      assistantId = id;
      return {
        ...prev,
        messages: [...prev.messages, { id, role: 'assistant', text: '' }],
        isStreaming: true,
        error: null,
      };
    });
    const working = cloneSpec(specRef.current);
    const parser = createMixedStreamParser({
      onText(chunk) {
        const id = assistantId;
        if (id === null) return;
        // Strip any JSON-patch tail the mixed-stream parser couldn't
        // recognize (model occasionally jams prose + JSON onto the
        // same line; stripPatchJson keeps the prose, drops the rest).
        const cleaned = stripPatchJson(chunk);
        if (cleaned === '') return;
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === id ? { ...m, text: m.text + cleaned } : m,
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
    turnRef.current = { turnId, assistantId, working, parser };
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
        // Fresh turn started server-side. Reset our parser for it.
        turnRef.current = {
          turnId: event.turnId,
          assistantId: null,
          working: buildEmptySpec(),
          parser: null,
        };
        setState((prev) => ({ ...prev, isStreaming: true, error: null }));
        return;
      }
      if (event.type === 'chunk') {
        ensureTurnContext(event.turnId);
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
  }, [eventsApi, ensureTurnContext, conversationIdRef.current]);

  const send = useCallback(
    async (text: string, attachments?: ImageAttachment[]) => {
      const trimmed = text.trim();
      // An attached image with empty text is still a valid turn
      // ("here's a screenshot, do something with it"). Only short-
      // circuit when both are empty.
      if (!trimmed && (!attachments || attachments.length === 0)) return;

      const userMsg: DecoroMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: trimmed,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
