import { jsonError } from '../../../../../lib/api-response.ts';
import { CONVERSATION_ID_PATTERN } from '../../../../../lib/conversation-types.ts';
import { subscribe } from '../../../../../lib/job-store.ts';
import {
  type StreamEvent,
  encodeStreamEvent,
} from '../../../../../lib/stream-events.ts';

type Params = Promise<{ id: string }>;

/**
 * SSE endpoint that delivers in-flight LLM stream events for a
 * conversation (per ADR-016).
 *
 * The browser opens this with `EventSource('/api/conversations/<id>/events')`.
 * Behavior:
 *   - If a job is currently running for the conversation, the
 *     subscriber receives any buffered text immediately (replay), then
 *     live `chunk` events, then `done` (or `error`) when the job ends.
 *   - If no job is running, the subscriber receives a single `done`
 *     event right away. The browser's EventSource auto-reconnects, so
 *     the client is responsible for closing the connection on `done`
 *     to avoid an infinite reopen loop.
 *
 * No auth — same trust model as `/api/share` and `/api/generate` per
 * ADR-013 ("self-hosted, trusted-network MVP").
 */
export const GET = async (_req: Request, { params }: { params: Params }) => {
  const { id } = await params;
  if (!CONVERSATION_ID_PATTERN.test(id)) {
    return jsonError(404, 'Conversation not found');
  }

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeStreamEvent(event)));
        } catch {
          // Client closed the connection between events — nothing to do.
        }
        if (event.type === 'done' || event.type === 'error') {
          // Close the stream so the browser stops auto-reconnecting.
          // The job-store has already cleaned us up if this came from
          // a real terminal event; if it was the synthetic `done` for
          // an idle conversation the unsubscribe was already a noop.
          try {
            controller.close();
          } catch {
            // already closed
          }
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        }
      };
      unsubscribe = subscribe(id, send);
    },
    cancel() {
      // Client (browser tab close, navigation away, hook cleanup) closed
      // the stream first. Detach the subscriber so the job-store stops
      // notifying us.
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      // Disable proxy buffering so chunks reach the browser as they're
      // emitted (relevant behind nginx; harmless elsewhere).
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
};
