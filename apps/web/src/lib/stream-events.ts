/**
 * Wire format for the SSE channel that delivers in-flight LLM output to
 * the chat UI. Each turn emits a `start` (so reconnecting subscribers
 * reset their parser cleanly), zero or more `chunk` events with the raw
 * text the LLM produced, then either `done` or `error`.
 *
 * The chunk text is the unparsed mixed prose-then-JSONL stream the
 * model emits — `createMixedStreamParser` on the client splits prose
 * (assistant message text) from spec patches. Server-side parsing is
 * only used to compute the final state for the DB PATCH; per-chunk
 * deltas reach the client raw, exactly as they would in the
 * pre-server-streaming design.
 */
export type StreamEvent =
  | { type: 'start'; turnId: string }
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
