import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

/**
 * LLM configuration consumed by `createModel`. The shape is intentionally a
 * discriminated union so adding `provider: 'google'` or `provider: 'openai'`
 * later only adds branches — existing call sites stay exhaustive.
 *
 * MVP only verifies the `anthropic` branch end-to-end (per ADR-005).
 */
export type LlmConfig = {
  provider: 'anthropic';
  model: string;
  apiKey?: string;
};

/**
 * Resolve a config into an AI SDK model instance. Server-side only — never
 * import this from client components, since the API key would leak into the
 * client bundle.
 *
 * Single-branch today because `LlmConfig.provider` is a singleton union; the
 * branch comes back as a switch when a second provider lands.
 */
export const createModel = (config: LlmConfig): LanguageModel => {
  const anthropic = createAnthropic({ apiKey: config.apiKey });
  return anthropic(config.model);
};
