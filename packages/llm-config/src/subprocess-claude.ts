// `server-only` is a side-effect import that makes the bundler refuse to
// include this module in client code. We spawn a child process here;
// `node:child_process` is unavailable in the browser, and a stray client
// import would otherwise produce a confusing build error far from the
// real cause.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { spawn } from 'node:child_process';

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider';

/**
 * Spawn a local `claude` CLI process and adapt its `--print --output-format
 * stream-json` output into a Vercel AI SDK `LanguageModelV2`. Use case:
 * monkey-testing Decoro against your ChatGPT-style Claude subscription
 * without paying per-token API charges.
 *
 * Trade-offs vs. real API providers:
 *   - Latency: each call spawns a process (~1.5s overhead even for empty
 *     prompts). Fine for manual dogfood, painful in tests / CI.
 *   - Auth: relies on whatever account `claude` is logged into on this
 *     machine. **Critically**, when this provider is used from a server
 *     started outside an interactive `claude` session (e.g. plain
 *     `pnpm dev`), the CLI cannot reach its macOS Keychain credentials
 *     and exits 1 with "Not logged in". Workaround: run
 *     `claude setup-token` to mint a long-lived token and export it as
 *     `CLAUDE_CODE_OAUTH_TOKEN` (e.g. via `.env.local`). The spawned
 *     CLI picks it up from process.env without keychain access.
 *   - Output shape: the CLI emits assistant turns plus tool / status events.
 *     We discard everything except `text_delta` events, which is what the
 *     Vercel AI SDK actually consumes.
 *   - Tool use: explicitly disabled (`--tools ""`, no MCP, no slash
 *     commands) so Claude responds purely as a chat completion. Decoro
 *     does NOT want Claude trying to edit local files mid-generation.
 */
export type SubprocessClaudeOptions = {
  /** Path / name of the CLI binary. Defaults to `claude` on PATH. */
  command?: string;
  /** Extra args appended after the built-in flags but before the prompt. */
  extraArgs?: string[];
};

type ClaudeStreamEvent = {
  type?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
  };
  usage?: { input_tokens?: number; output_tokens?: number };
  message?: string;
};

const collectText = (parts: ReadonlyArray<{ type: string }>): string =>
  parts
    .flatMap((p): string[] =>
      p.type === 'text' ? [(p as LanguageModelV2TextPart).text] : [],
    )
    .join('');

/**
 * Flatten an AI SDK V2 prompt into the two pieces the Claude CLI accepts:
 * a single `--system-prompt` string and a single positional user prompt.
 *
 * Conversation history is concatenated into the user prompt with role
 * labels — the LLM sees the full back-and-forth, including its own prior
 * JSONL patches, so iteration prompts (`buildUserPrompt`) work the same as
 * with API-backed providers. Tool / file / image parts are dropped:
 * Decoro's `/api/generate` only ever sends text, and the CLI doesn't have
 * a clean way to round-trip the rest.
 */
const flattenPrompt = (
  prompt: LanguageModelV2Prompt,
): { system: string; user: string } => {
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
  return {
    system: systemParts.join('\n\n'),
    user: conversation.join('\n\n'),
  };
};

const buildArgs = (
  modelId: string,
  system: string,
  user: string,
  extraArgs: readonly string[],
): string[] => [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--mcp-config',
  '{"mcpServers":{}}',
  '--disable-slash-commands',
  '--tools',
  '',
  '--model',
  modelId,
  '--system-prompt',
  system,
  ...extraArgs,
  user,
];

const createClaudeStream = (
  modelId: string,
  opts: SubprocessClaudeOptions,
  callOptions: LanguageModelV2CallOptions,
): ReadableStream<LanguageModelV2StreamPart> => {
  const { system, user } = flattenPrompt(callOptions.prompt);
  const args = buildArgs(modelId, system, user, opts.extraArgs ?? []);
  const command = opts.command ?? 'claude';

  return new ReadableStream<LanguageModelV2StreamPart>({
    start(controller) {
      const proc = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: callOptions.abortSignal,
      });

      const textBlockId = 'text-0';
      let textStarted = false;
      let textEnded = false;
      let buffer = '';
      let stderr = '';
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let finishReason: LanguageModelV2FinishReason = 'unknown';

      controller.enqueue({ type: 'stream-start', warnings: [] });

      const handleEvent = (event: ClaudeStreamEvent) => {
        if (event.type === 'stream_event') {
          const inner = event.event;
          if (
            inner?.type === 'content_block_delta' &&
            inner.delta?.type === 'text_delta' &&
            typeof inner.delta.text === 'string'
          ) {
            if (!textStarted) {
              controller.enqueue({ type: 'text-start', id: textBlockId });
              textStarted = true;
            }
            controller.enqueue({
              type: 'text-delta',
              id: textBlockId,
              delta: inner.delta.text,
            });
          }
          return;
        }
        if (event.type === 'result') {
          inputTokens = event.usage?.input_tokens;
          outputTokens = event.usage?.output_tokens;
          finishReason = 'stop';
        }
      };

      // stdio is `[ignore, pipe, pipe]`, so both streams are non-null.
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        for (;;) {
          const nl = buffer.indexOf('\n');
          if (nl < 0) break;
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line === '') continue;
          try {
            handleEvent(JSON.parse(line) as ClaudeStreamEvent);
          } catch {
            // Non-JSON line (banner / debug) — ignore. The stream-json
            // format is one JSON object per line; anything that fails to
            // parse is noise we can safely drop.
          }
        }
      });

      const finalize = (err?: Error) => {
        if (textStarted && !textEnded) {
          controller.enqueue({ type: 'text-end', id: textBlockId });
          textEnded = true;
        }
        if (err) {
          controller.enqueue({ type: 'error', error: err });
          finishReason = 'error';
        }
        const usage: LanguageModelV2Usage = {
          inputTokens,
          outputTokens,
          totalTokens:
            inputTokens === undefined || outputTokens === undefined
              ? undefined
              : inputTokens + outputTokens,
        };
        controller.enqueue({ type: 'finish', usage, finishReason });
        controller.close();
      };

      proc.on('error', (err) => {
        finalize(err);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          finalize();
          return;
        }
        // The CLI exits 1 with no stderr when it can't reach its
        // credentials — most commonly when launched from a process tree
        // (e.g. Next.js dev) that doesn't share macOS Keychain access
        // with the user's interactive `claude` install. Surface a
        // pointer rather than the bare exit code so the user knows
        // where to look.
        const detail = stderr.trim() || buffer.trim();
        const hint =
          detail === '' || /not logged in/i.test(detail)
            ? ' (claude is unauthenticated in this process — try `claude setup-token` and export CLAUDE_CODE_OAUTH_TOKEN in .env.local)'
            : '';
        finalize(
          new Error(
            `claude CLI exited with code ${String(code)}: ${detail || '(no stderr)'}${hint}`,
          ),
        );
      });
    },
  });
};

export const createSubprocessClaude = (
  modelId: string,
  opts: SubprocessClaudeOptions = {},
): LanguageModelV2 => {
  const doStream = (callOptions: LanguageModelV2CallOptions) =>
    Promise.resolve({ stream: createClaudeStream(modelId, opts, callOptions) });

  return {
    specificationVersion: 'v2',
    provider: 'subprocess-claude',
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
        // subprocess stream, and we need each one before deciding what to
        // do with it. Promise.all wouldn't apply.
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
