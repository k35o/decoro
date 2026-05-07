// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. We spawn a child process here;
// `node:child_process` is unavailable in the browser, and a stray client
// import would otherwise produce a confusing build error far from the
// real cause.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { spawn } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';

/**
 * Spawn the locally installed `codex app-server` and adapt its
 * JSON-RPC protocol into a Vercel AI SDK `LanguageModelV2`.
 *
 * Use case: vision-capable LLM access via the operator's ChatGPT
 * subscription. `subprocess-claude` covers the same role for Claude.ai
 * subscribers but is text-only because the `claude --print` flow has
 * no image plumbing here yet; codex's `localImage` content type lets
 * us send Decoro's data-URI attachments through to a vision-capable
 * gpt-5 family model with no API key.
 *
 * Protocol shape (per `codex app-server generate-ts` output):
 *   1. spawn `codex app-server` (stdio transport, default).
 *   2. send `initialize` — handshakes client info / capabilities.
 *   3. send `thread/start` — creates a thread, sets `developerInstructions`
 *      to our system prompt, picks the model.
 *   4. send `turn/start` — the user input, mixed text + localImage
 *      content items.
 *   5. listen for `item/agentMessage/delta` notifications — these
 *      carry the streaming text we forward as `text-delta` events.
 *   6. listen for `turn/completed` — close the stream cleanly.
 *
 * Trade-offs vs. API providers:
 *   - Per-request subprocess spawn (~1-2 s overhead). Fine for manual
 *     dogfood, painful in CI.
 *   - ChatGPT subscription auth — `codex login` once on the host,
 *     `app-server` picks up the cached credentials.
 *   - Tools are explicitly disabled (`approvalPolicy: 'never'`,
 *     `sandbox: 'read-only'`) so the codex agent behaves as a chat
 *     completion: respond, don't execute anything.
 *   - Agent-shaped framing means we ignore tool / shell / fs item
 *     notifications. A misbehaving prompt that triggers tool calls
 *     stalls (the agent waits for approval that never comes); we
 *     guard with a hard turn-timeout. The Decoro system prompt asks
 *     for JSONL patches — no tool calls expected in practice.
 */

export type SubprocessCodexOptions = {
  /** Path / name of the CLI binary. Defaults to `codex` on PATH. */
  command?: string;
  /** Codex model id. Defaults to `gpt-5.4` (vision-capable). */
  model?: string;
  /** Hard turn timeout in ms. Defaults to 5 minutes. */
  turnTimeoutMs?: number;
};

type JsonRpcMessage = {
  jsonrpc?: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
};

const DEFAULT_TURN_TIMEOUT_MS = 5 * 60 * 1000;

const collectText = (parts: ReadonlyArray<{ type: string }>): string =>
  parts
    .flatMap((p): string[] =>
      p.type === 'text' ? [(p as unknown as { text: string }).text] : [],
    )
    .join('');

/**
 * Pull image data-URI parts off a multimodal user message, returning
 * the base64 payloads with their media types so the caller can write
 * temp files for `localImage` content items.
 */
const collectImageDataUris = (
  parts: ReadonlyArray<{ type: string }>,
): Array<{ mediaType: string; dataUri: string }> => {
  const out: Array<{ mediaType: string; dataUri: string }> = [];
  for (const part of parts) {
    if (part.type !== 'file') continue;
    const filePart = part as {
      type: 'file';
      mediaType?: string;
      data?: unknown;
    };
    const { data } = filePart;
    if (typeof data !== 'string') continue;
    if (!data.startsWith('data:image/')) continue;
    out.push({
      mediaType: filePart.mediaType ?? 'image/png',
      dataUri: data,
    });
  }
  return out;
};

const extToMediaType = (mediaType: string): string => {
  if (mediaType.includes('png')) return 'png';
  if (mediaType.includes('jpeg') || mediaType.includes('jpg')) return 'jpg';
  if (mediaType.includes('webp')) return 'webp';
  if (mediaType.includes('gif')) return 'gif';
  return 'png';
};

const unlinkBestEffort = async (path: string): Promise<void> => {
  try {
    await unlink(path);
  } catch {
    // ignore — stale temp file is acceptable
  }
};

const dataUriToBuffer = (dataUri: string): Buffer => {
  const comma = dataUri.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URI');
  const base64 = dataUri.slice(comma + 1);
  return Buffer.from(base64, 'base64');
};

/**
 * Materialize image parts from `prompt` into temp files and return
 * the absolute paths (in turn order). The caller passes these to
 * codex via `localImage` content items, then unlinks them when the
 * stream finishes.
 */
const writeImageTempFiles = async (
  prompt: LanguageModelV2Prompt,
): Promise<string[]> => {
  const last = prompt.at(-1);
  if (last?.role !== 'user') return [];
  const images = collectImageDataUris(last.content);
  const paths: string[] = [];
  for (const img of images) {
    const ext = extToMediaType(img.mediaType);
    const path = join(tmpdir(), `decoro-codex-${crypto.randomUUID()}.${ext}`);
    // oxlint-disable-next-line eslint(no-await-in-loop)
    await writeFile(path, dataUriToBuffer(img.dataUri));
    paths.push(path);
  }
  return paths;
};

/**
 * Convert the AI SDK V2 prompt into:
 *   - `developerInstructions` (the joined system message), and
 *   - the `input` array for `turn/start` covering the *latest* user
 *     turn, with text + localImage content items.
 *
 * Earlier turns of the conversation history aren't replayed across
 * the JSON-RPC boundary — codex's thread model is per-process and we
 * spawn a fresh thread per `streamText` call. We pack the entire
 * conversation transcript as text into the user message (same trick
 * `subprocess-claude` uses).
 */
const buildTurnInput = (
  prompt: LanguageModelV2Prompt,
  imagePaths: string[],
): {
  developerInstructions: string;
  input: Array<Record<string, unknown>>;
} => {
  const systemParts: string[] = [];
  const conversation: string[] = [];
  for (const msg of prompt) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
      continue;
    }
    if (msg.role === 'tool') continue;
    const text = collectText(msg.content);
    if (text === '') continue;
    const label = msg.role === 'assistant' ? 'ASSISTANT' : 'USER';
    conversation.push(`${label}:\n${text}`);
  }
  const input: Array<Record<string, unknown>> = [];
  if (conversation.length > 0) {
    input.push({
      type: 'text',
      text: conversation.join('\n\n'),
      text_elements: [],
    });
  }
  for (const path of imagePaths) {
    input.push({ type: 'localImage', path });
  }
  return {
    developerInstructions: systemParts.join('\n\n'),
    input,
  };
};

const createCodexStream = (
  modelId: string,
  opts: SubprocessCodexOptions,
  callOptions: LanguageModelV2CallOptions,
): ReadableStream<LanguageModelV2StreamPart> => {
  const command = opts.command ?? 'codex';
  const turnTimeoutMs = opts.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;

  return new ReadableStream<LanguageModelV2StreamPart>({
    start(controller) {
      const proc = spawn(command, ['app-server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: callOptions.abortSignal,
      });

      const textBlockId = 'text-0';
      let textStarted = false;
      let textEnded = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let nextRequestId = 0;
      // Closure-shared mutable state, initialized to null and reassigned
      // in the JSON-RPC handlers below. Lint reports the initial null
      // as "useless assignment" because it can't see the closure
      // reads; the alternative is `let threadId: string | null;`
      // which the read-before-write rule then flags instead.
      // oxlint-disable-next-line eslint(no-useless-assignment)
      let threadId: string | null = null;
      const imagePathsToCleanup: string[] = [];
      // oxlint-disable-next-line eslint(no-useless-assignment)
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let finished = false;

      const send = (msg: Record<string, unknown>) => {
        proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
      };

      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        proc.kill();
        // Best-effort temp file cleanup; fire-and-forget so a slow rm
        // doesn't block the caller. Errors are swallowed because the
        // worst case is a stale file in /tmp.
        for (const path of imagePathsToCleanup) {
          void unlinkBestEffort(path);
        }
      };

      const finalize = (
        finishReason: LanguageModelV2FinishReason,
        err?: Error,
      ) => {
        if (finished) return;
        finished = true;
        if (textStarted && !textEnded) {
          controller.enqueue({ type: 'text-end', id: textBlockId });
          textEnded = true;
        }
        if (err) {
          controller.enqueue({ type: 'error', error: err });
        }
        // Codex's app-server doesn't surface input/output token counts
        // on its public protocol — leave the fields undefined, which
        // the AI SDK passes through unchanged.
        const usage: LanguageModelV2Usage = {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        };
        controller.enqueue({ type: 'finish', usage, finishReason });
        controller.close();
        cleanup();
      };

      timeoutHandle = setTimeout(() => {
        finalize(
          'error',
          new Error(
            `codex app-server turn exceeded ${(turnTimeoutMs / 1000).toString()}s timeout`,
          ),
        );
      }, turnTimeoutMs);

      controller.enqueue({ type: 'stream-start', warnings: [] });

      void (async () => {
        try {
          imagePathsToCleanup.push(
            ...(await writeImageTempFiles(callOptions.prompt)),
          );
          const { developerInstructions, input } = buildTurnInput(
            callOptions.prompt,
            imagePathsToCleanup,
          );

          let streamedText = '';
          const handleMessage = (msg: JsonRpcMessage) => {
            // Streaming text — our primary signal.
            if (
              msg.method === 'item/agentMessage/delta' &&
              typeof msg.params?.['delta'] === 'string'
            ) {
              if (!textStarted) {
                controller.enqueue({ type: 'text-start', id: textBlockId });
                textStarted = true;
              }
              const { delta } = msg.params as { delta: string };
              controller.enqueue({
                type: 'text-delta',
                id: textBlockId,
                delta,
              });
              streamedText += delta;
              return;
            }
            // Fallback for responses codex flushes as a single
            // `item/completed` with `type: 'agentMessage'` instead of
            // streaming via deltas. Short replies and some reasoning
            // configurations land here without ever emitting a delta.
            // The completed item carries the FULL text; emit whatever
            // gap exists between the deltas we saw and the canonical
            // text so downstream gets the complete assistant message.
            if (msg.method === 'item/completed') {
              const item = msg.params?.['item'] as
                | { type?: string; text?: string }
                | undefined;
              if (
                item?.type === 'agentMessage' &&
                typeof item.text === 'string' &&
                item.text !== ''
              ) {
                const remainder = item.text.startsWith(streamedText)
                  ? item.text.slice(streamedText.length)
                  : item.text;
                if (remainder !== '') {
                  if (!textStarted) {
                    controller.enqueue({
                      type: 'text-start',
                      id: textBlockId,
                    });
                    textStarted = true;
                  }
                  controller.enqueue({
                    type: 'text-delta',
                    id: textBlockId,
                    delta: remainder,
                  });
                  streamedText = item.text;
                }
              }
              return;
            }
            // Turn finished — tear down.
            if (msg.method === 'turn/completed') {
              finalize('stop');
              return;
            }
            // Surface protocol-level errors as stream errors.
            if (msg.method === 'error') {
              const errParam = msg.params?.['error'] as
                | { message?: unknown }
                | undefined;
              const message =
                typeof errParam?.message === 'string'
                  ? errParam.message
                  : 'codex app-server reported an error';
              finalize('error', new Error(message));
              return;
            }
            // JSON-RPC response with id matches our request flow.
            if (msg.id === undefined) return;
            // 1) initialize → 2) thread/start → 3) turn/start
            if (msg.id === 1 && msg.result) {
              const id = ++nextRequestId;
              send({
                method: 'thread/start',
                id,
                params: {
                  model: opts.model ?? modelId,
                  developerInstructions,
                  // Disable tool / shell / fs use — we want pure
                  // text completion. `never` denies any approval
                  // request the agent emits, so it can't take
                  // destructive actions even if it tries.
                  approvalPolicy: 'never',
                  sandbox: 'read-only',
                  experimentalRawEvents: false,
                  persistExtendedHistory: false,
                  ephemeral: true,
                },
              });
              return;
            }
            if (msg.id === 2 && msg.result) {
              const result = msg.result as {
                thread?: { id?: string };
              };
              threadId = result.thread?.id ?? null;
              if (threadId === null || threadId === '') {
                finalize('error', new Error('thread/start missing thread.id'));
                return;
              }
              const id = ++nextRequestId;
              send({
                method: 'turn/start',
                id,
                params: { threadId, input },
              });
              return;
            }
            if (msg.id === 3 && msg.result) {
              // turn/start ack — id captured server-side; we don't
              // currently need it on the client (cancellation would
              // use it, but we abort the whole subprocess instead).
              return;
            }
            // Any JSON-RPC response carrying an error.
            if (msg.error) {
              finalize(
                'error',
                new Error(
                  msg.error.message ??
                    `codex app-server JSON-RPC error code ${(msg.error.code ?? 0).toString()}`,
                ),
              );
            }
          };

          proc.stdout.on('data', (chunk: Buffer) => {
            stdoutBuffer += chunk.toString('utf8');
            for (;;) {
              const nl = stdoutBuffer.indexOf('\n');
              if (nl < 0) break;
              const line = stdoutBuffer.slice(0, nl).trim();
              stdoutBuffer = stdoutBuffer.slice(nl + 1);
              if (line === '') continue;
              try {
                handleMessage(JSON.parse(line) as JsonRpcMessage);
              } catch {
                // Non-JSON noise — ignore.
              }
            }
          });

          proc.stderr.on('data', (chunk: Buffer) => {
            stderrBuffer += chunk.toString('utf8');
          });

          proc.on('error', (err) => {
            finalize('error', err);
          });

          proc.on('close', (code) => {
            if (finished) return;
            finalize(
              'error',
              new Error(
                `codex app-server exited with code ${(code ?? -1).toString()}: ${stderrBuffer.trim() || '(no stderr)'}`,
              ),
            );
          });

          // Kick off the JSON-RPC sequence.
          const initId = ++nextRequestId;
          send({
            method: 'initialize',
            id: initId,
            params: {
              clientInfo: {
                name: 'decoro',
                title: 'Decoro',
                version: '0',
              },
              capabilities: {
                experimentalApi: false,
              },
            },
          });
        } catch (err) {
          finalize(
            'error',
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      })();
    },
  });
};

export const createSubprocessCodex = (
  modelId: string,
  opts: SubprocessCodexOptions = {},
): LanguageModelV2 => {
  const doStream = (callOptions: LanguageModelV2CallOptions) =>
    Promise.resolve({ stream: createCodexStream(modelId, opts, callOptions) });

  return {
    specificationVersion: 'v2',
    provider: 'subprocess-codex',
    modelId,
    supportedUrls: {},

    doStream,

    async doGenerate(callOptions) {
      const { stream } = await doStream(callOptions);
      const reader = stream.getReader();
      let text = '';
      let usage: LanguageModelV2Usage = {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
      };
      let finishReason: LanguageModelV2FinishReason = 'unknown';
      for (;;) {
        // Sequential await is required: chunks arrive in order from the
        // subprocess stream, and we need each one before deciding what
        // to do with it. Promise.all wouldn't apply.
        // oxlint-disable-next-line eslint(no-await-in-loop)
        const { value, done } = await reader.read();
        if (done) break;
        if (value.type === 'text-delta') text += value.delta;
        else if (value.type === 'finish') {
          ({ usage } = value);
          ({ finishReason } = value);
        }
      }
      return {
        content: text === '' ? [] : [{ type: 'text', text }],
        finishReason,
        usage,
        warnings: [],
      };
    },
  };
};
