import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

/**
 * LLM configuration consumed by `createModel`. The shape is a discriminated
 * union so adding `provider: 'openai'` later only adds branches — existing
 * call sites stay exhaustive.
 *
 * MVP-time provider matrix (per ADR-005):
 *   - `anthropic` is the verified target for the value-validation hypothesis
 *     (json-render structured output is strongest here).
 *   - `google` is wired so contributors without an Anthropic API key can
 *     still smoke-test on Gemini's free tier.
 */
export type LlmConfig =
  | { provider: 'anthropic'; model: string; apiKey?: string }
  | { provider: 'google'; model: string; apiKey?: string };

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
    default: {
      // Exhaustiveness guard. Adding a new provider must also add a case.
      const exhaustive: never = config;
      throw new Error(
        `Unsupported LLM provider: ${(exhaustive as LlmConfig).provider}`,
      );
    }
  }
};
