// `server-only` is a side-effect import: it has no exports, it just makes
// the bundler refuse to include this module in client code. Decoro reads
// API keys from `process.env` here; an accidental import from a client
// component would compile that env access into the browser bundle and leak
// the key.
// oxlint-disable-next-line eslint-plugin-import(no-unassigned-import)
import 'server-only';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

import { createSubprocessClaude } from './subprocess-claude.ts';
import { createSubprocessCodex } from './subprocess-codex.ts';

/**
 * LLM configuration consumed by `createModel`. Discriminated union so
 * adding `provider: 'openai'` later only adds branches — existing call
 * sites stay exhaustive.
 *
 * Supported providers:
 *   - `anthropic`: Claude via the Anthropic API (the most thoroughly
 *     tested target for Decoro's structured JSON output).
 *   - `google`: Gemini direct, useful when you only have a Google API
 *     key (Gemini's free tier is generous).
 *   - `gateway`: Vercel AI Gateway — one key reaches every supported
 *     provider (model strings look like `anthropic/...`, `google/...`,
 *     `openai/...`). Usually the lowest-friction path.
 *   - `subprocess-claude`: shells out to the locally installed `claude`
 *     CLI and adapts its `--print --output-format stream-json` output.
 *     Lets you monkey-test against your Claude subscription with no
 *     per-token API charges. Text-only — vision turns currently fall
 *     through with the image stripped. Process spawn overhead
 *     (~1.5s/turn) makes this unfit for tests / CI.
 *   - `subprocess-codex`: shells out to `codex app-server` and adapts
 *     its JSON-RPC over stdio protocol. Same shape as
 *     `subprocess-claude` (subscription-backed, no API key) but
 *     **vision-capable** via codex's `localImage` content type — the
 *     only local provider that can see Decoro's image attachments.
 *     Uses gpt-5 family models on the operator's ChatGPT subscription.
 */
export type LlmConfig =
  | { provider: 'anthropic'; model: string; apiKey?: string }
  | { provider: 'google'; model: string; apiKey?: string }
  | { provider: 'gateway'; model: string; apiKey?: string }
  | { provider: 'subprocess-claude'; model: string; command?: string }
  | {
      provider: 'subprocess-codex';
      model: string;
      command?: string;
      turnTimeoutMs?: number;
    };

/**
 * Resolve a config into an AI SDK model instance. Server-side only — never
 * import this from client components, since the API key would leak into the
 * client bundle.
 */
export const createModel = (config: LlmConfig): LanguageModel => {
  switch (config.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(config.model);
    }
    case 'gateway': {
      const gateway = createGateway({ apiKey: config.apiKey });
      return gateway(config.model);
    }
    case 'subprocess-claude': {
      return createSubprocessClaude(config.model, { command: config.command });
    }
    case 'subprocess-codex': {
      return createSubprocessCodex(config.model, {
        command: config.command,
        turnTimeoutMs: config.turnTimeoutMs,
      });
    }
    default: {
      // Exhaustiveness guard. Adding a new provider must also add a case.
      const exhaustive: never = config;
      throw new Error(
        `Unsupported LLM provider: ${(exhaustive as LlmConfig).provider}`,
      );
    }
  }
};
