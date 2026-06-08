// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. The job store is a per-process
// in-memory map with subscriber callbacks; client bundling would only
// confuse the React tree.
// oxlint-disable-next-line import/no-unassigned-import
import 'server-only';
import type { StreamEvent } from './stream-events.ts';

/**
 * In-memory pub/sub for in-flight LLM streams (per ADR-016).
 *
 * Keyed by `conversationId`: at most one job runs per conversation at
 * a time. Submitting a new turn while one is running cancels the
 * previous job and emits a `start` event with a fresh `turnId` so any
 * subscribers reset their parser before chunks for the new turn arrive.
 *
 * Each job buffers everything emitted for its current turn so a late
 * subscriber (a teammate opening the conversation mid-generation, a
 * client reconnecting after a refresh) replays the full text and then
 * picks up live chunks. Buffer + subscribers are torn down 60 s after
 * `done` to leave room for short reconnect windows.
 *
 * Per-process state — multi-instance deployments need a shared
 * pub/sub layer (Postgres LISTEN/NOTIFY or Redis); this is fine for
 * the single-instance self-host MVP target.
 */

type JobStatus = 'running' | 'done' | 'error';

type Subscriber = (event: StreamEvent) => void;

type Job = {
  conversationId: string;
  turnId: string;
  buffer: string;
  status: JobStatus;
  errorMessage?: string;
  abort: AbortController;
  subscribers: Set<Subscriber>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const RETENTION_AFTER_DONE_MS = 60_000;

const jobs = new Map<string, Job>();

const newTurnId = (): string => crypto.randomUUID();

const notify = (job: Job, event: StreamEvent) => {
  for (const sub of job.subscribers) {
    try {
      sub(event);
    } catch (err) {
      console.error('[job-store] subscriber threw:', err);
    }
  }
};

const scheduleCleanup = (job: Job) => {
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => {
    if (jobs.get(job.conversationId) === job) {
      jobs.delete(job.conversationId);
    }
    job.subscribers.clear();
  }, RETENTION_AFTER_DONE_MS);
};

/**
 * Replace any existing job for `conversationId` with a fresh one. Old
 * subscribers stay attached and receive a `start` event for the new
 * turn so their parser resets; the cancelled job's abort signal fires
 * so its in-flight LLM call short-circuits.
 *
 * Returns the job + its abort signal so the caller can wire it into
 * `streamText`.
 */
export const startJob = (
  conversationId: string,
): {
  turnId: string;
  signal: AbortSignal;
  appendChunk: (text: string) => void;
  complete: () => void;
  fail: (message: string) => void;
} => {
  const existing = jobs.get(conversationId);
  if (existing) {
    existing.abort.abort();
    if (existing.cleanupTimer) clearTimeout(existing.cleanupTimer);
  }
  const turnId = newTurnId();
  const job: Job = {
    conversationId,
    turnId,
    buffer: '',
    status: 'running',
    abort: new AbortController(),
    subscribers: existing?.subscribers ?? new Set(),
  };
  jobs.set(conversationId, job);
  notify(job, { type: 'start', turnId });
  return {
    turnId,
    signal: job.abort.signal,
    appendChunk: (text: string) => {
      if (job.status !== 'running') return;
      job.buffer += text;
      notify(job, { type: 'chunk', turnId, text });
    },
    complete: () => {
      if (job.status !== 'running') return;
      job.status = 'done';
      notify(job, { type: 'done', turnId });
      scheduleCleanup(job);
    },
    fail: (message: string) => {
      if (job.status !== 'running') return;
      job.status = 'error';
      job.errorMessage = message;
      notify(job, { type: 'error', turnId, message });
      scheduleCleanup(job);
    },
  };
};

/**
 * Returns whether a job is currently running for `conversationId`.
 * Used by the sidebar's generating-indicator endpoint and by the SSE
 * route to decide whether to attach or close immediately.
 */
export const isJobRunning = (conversationId: string): boolean => {
  const job = jobs.get(conversationId);
  return job?.status === 'running';
};

/**
 * List the conversation ids that currently have a running job. Used by
 * the sidebar's polling indicator so all conversations with in-flight
 * work show the spinner regardless of which one is active in the UI.
 */
export const runningConversationIds = (): string[] => {
  const ids: string[] = [];
  for (const [id, job] of jobs) {
    if (job.status === 'running') ids.push(id);
  }
  return ids;
};

/**
 * Subscribe to events for a conversation. Immediately replays the
 * current job's buffer (if any) and then forwards live events. Returns
 * an unsubscribe function the SSE handler must call when the connection
 * closes.
 *
 * If no job exists for the conversation when the subscription starts,
 * the subscriber receives a synthetic `done` event so the SSE handler
 * can close cleanly. This matches the "this conversation is idle"
 * semantics — the route doesn't need a separate "is there a job?" check.
 */
export const subscribe = (
  conversationId: string,
  subscriber: Subscriber,
): (() => void) => {
  const job = jobs.get(conversationId);
  if (!job) {
    // No active job — synthesize a `done` so the client closes the SSE
    // and falls back to whatever the DB has. The synthetic turn id
    // doesn't collide with anything because the client only uses it for
    // matching `chunk` events with their `start`.
    subscriber({ type: 'done', turnId: 'idle' });
    return () => {
      // noop — never attached
    };
  }
  if (job.buffer.length > 0) {
    subscriber({ type: 'chunk', turnId: job.turnId, text: job.buffer });
  }
  if (job.status === 'done') {
    subscriber({ type: 'done', turnId: job.turnId });
    return () => {
      // noop — terminal
    };
  }
  if (job.status === 'error') {
    subscriber({
      type: 'error',
      turnId: job.turnId,
      message: job.errorMessage ?? 'Stream errored',
    });
    return () => {
      // noop — terminal
    };
  }
  job.subscribers.add(subscriber);
  return () => {
    job.subscribers.delete(subscriber);
  };
};
