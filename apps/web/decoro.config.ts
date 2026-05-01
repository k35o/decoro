import type { LlmConfig } from '@decoro/llm-config';

/**
 * Decoro configuration. Edit this file to point Decoro at your preferred LLM
 * provider and model. The API key is read from `ANTHROPIC_API_KEY` in the
 * environment (see the repo-root `.env.example`); do not hard-code it here.
 *
 * Lives next to the Next.js app (rather than the repo root that
 * `docs/architecture.md` originally sketched) for two practical reasons:
 *   1. pnpm does not hoist workspace packages to the repo root, so a config at
 *      the repo root cannot resolve `@decoro/llm-config`.
 *   2. Next.js picks up `apps/web/.env.local` for the API key without extra
 *      wiring when this file is consumed from `apps/web` server code.
 *
 * Adapter selection lives elsewhere for now — apps/web pins
 * `@decoro/adapter-arte-odyssey` directly. A `defineConfig` helper that
 * bundles adapter + LLM together can ship once we have a second adapter to
 * motivate the abstraction (per ADR-004).
 */
export const llm: LlmConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  apiKey: process.env['ANTHROPIC_API_KEY'],
};
