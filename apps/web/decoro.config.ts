import type { LlmConfig } from '@decoro/llm-config';

/**
 * Decoro configuration. Edit this file to point Decoro at your preferred LLM
 * provider and model. API keys are read from environment variables (see
 * `.env.example` at the repo root); do not hard-code them here.
 *
 * Lives next to the Next.js app (rather than the repo root that
 * `docs/architecture.md` originally sketched) for two practical reasons:
 *   1. pnpm does not hoist workspace packages to the repo root, so a config at
 *      the repo root cannot resolve `@decoro/llm-config`.
 *   2. Next.js picks up `apps/web/.env.local` for the API key without extra
 *      wiring when this file is consumed from `apps/web` server code.
 *
 * Switching providers is a one-line change. The library design hypothesis
 * (ADR-003) is verified primarily on Anthropic Claude — the other branches
 * are wired so contributors can smoke-test without an Anthropic key.
 *
 * Vercel AI Gateway (default — free monthly credit, one key reaches every
 * provider, lowest setup friction):
 *   { provider: 'gateway', model: 'anthropic/claude-sonnet-4-6',
 *     apiKey: process.env['AI_GATEWAY_API_KEY'] }
 *
 * Anthropic direct:
 *   { provider: 'anthropic', model: 'claude-sonnet-4-6',
 *     apiKey: process.env['ANTHROPIC_API_KEY'] }
 *
 * Google Gemini direct (free tier):
 *   { provider: 'google', model: 'gemini-2.5-flash',
 *     apiKey: process.env['GOOGLE_GENERATIVE_AI_API_KEY'] }
 *
 * Adapter selection lives elsewhere for now — apps/web pins
 * `@decoro/adapter-arte-odyssey` directly. A `defineConfig` helper that
 * bundles adapter + LLM together can ship once we have a second adapter to
 * motivate the abstraction (per ADR-004).
 */
export const llm: LlmConfig = {
  provider: 'gateway',
  model: 'anthropic/claude-sonnet-4-6',
  apiKey: process.env['AI_GATEWAY_API_KEY'],
};
