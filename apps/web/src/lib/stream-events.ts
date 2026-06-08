/**
 * Wire format for the SSE channel that delivers in-flight LLM output to
 * the chat UI. Each turn emits a `start`, then either a one-shot `sync`
 * (the full buffer so far, sent to a subscriber that (re)connects mid-turn)
 * and/or zero or more live `chunk` deltas, then `done` or `error`.
 *
 * `sync` vs `chunk` is the crucial distinction: `sync` carries the FULL
 * accumulated buffer and means "rebuild this turn from scratch", so the
 * client resets the assistant message + working spec before re-parsing.
 * `chunk` is an incremental delta the client APPENDS. Without this split,
 * every reconnect replayed the buffer as a `chunk` and the client appended
 * it — duplicating the chat text (and re-applying every spec patch) once
 * per reconnect.
 *
 * The text is the unparsed mixed prose-then-JSONL stream the model emits —
 * `createMixedStreamParser` on the client splits prose (assistant message
 * text) from spec patches. Server-side parsing is only used to compute the
 * final state for the DB PATCH.
 */
export type StreamEvent =
  | { type: 'start'; turnId: string }
  | { type: 'sync'; turnId: string; text: string }
  | { type: 'chunk'; turnId: string; text: string }
  | { type: 'done'; turnId: string }
  | { type: 'error'; turnId: string; message: string };

/**
 * Encode an event as a single SSE record. Each line is `data: <payload>`
 * followed by a blank line that flushes the message. Newlines inside
 * `chunk.text` are preserved by JSON-encoding the whole event, so the
 * client decodes the JSON and gets back the original raw stream.
 */
export const encodeStreamEvent = (event: StreamEvent): string =>
  `data: ${JSON.stringify(event)}\n\n`;
