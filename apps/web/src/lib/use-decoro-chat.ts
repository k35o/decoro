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
};

type State = {
  messages: DecoroMessage[];
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
};

const initialState: State = {
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
 */
export const useDecoroChat = ({ api }: Options) => {
  const [state, setState] = useState<State>(initialState);
  const messagesRef = useRef<DecoroMessage[]>([]);
  messagesRef.current = state.messages;
  const specRef = useRef<Spec | null>(null);
  specRef.current = state.spec;
  const abortRef = useRef<AbortController | null>(null);

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
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
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
        onText() {
          // The system prompt tells the model to emit only JSONL patches; any
          // stray prose is ignored rather than surfaced in the chat pane.
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

        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            { id: crypto.randomUUID(), role: 'assistant', text: '' },
          ],
          isStreaming: false,
        }));
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState((prev) => ({ ...prev, isStreaming: false, error }));
      }
    },
    [api],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  return { ...state, send, clear };
};
