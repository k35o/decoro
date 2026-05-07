import { arteOdysseyAdapter } from '@decoro/adapter-arte-odyssey';
import type { LlmConfig } from '@decoro/llm-config';

/**
 * Decoro configuration. Edit this file to point Decoro at your preferred
 * LLM provider and design-system adapter. API keys are read from
 * environment variables — set them in `apps/web/.env.local` (see
 * `.env.example`), do not hard-code them here.
 *
 * Decoro is most thoroughly tested on Anthropic Claude. The other
 * provider options are wired so you can run Decoro against whatever
 * account / billing you already have.
 *
 * Switching providers is a one-line change to `llm` below.
 *
 * Vercel AI Gateway (recommended — one key reaches Anthropic / Google /
 * OpenAI; Vercel's free tier covers light dogfood):
 *   { provider: 'gateway', model: 'anthropic/claude-sonnet-4-6',
 *     apiKey: process.env['AI_GATEWAY_API_KEY'] }
 *
 * Anthropic direct:
 *   { provider: 'anthropic', model: 'claude-sonnet-4-6',
 *     apiKey: process.env['ANTHROPIC_API_KEY'] }
 *
 * Google Gemini direct (free tier available):
 *   { provider: 'google', model: 'gemini-2.5-flash',
 *     apiKey: process.env['GOOGLE_GENERATIVE_AI_API_KEY'] }
 *
 * Local Claude CLI (uses your personal Claude.ai subscription instead of
 * an API key — for solo local dogfood only):
 *   { provider: 'subprocess-claude', model: 'sonnet' }
 * Run `claude setup-token` once and put `CLAUDE_CODE_OAUTH_TOKEN` in
 * `.env.local`. Each request spawns the `claude` binary (~1.5s overhead),
 * so this is for manual exploration only — tests / CI should use an
 * API-backed provider.
 *
 * IMPORTANT: `subprocess-claude` consumes the operator's personal
 * subscription quota (5-hour rate limit) and must NEVER be used in a
 * deployment that other people can reach. Exposing your subscription as
 * a backend for other users violates Anthropic's terms of service
 * (effectively reselling Claude). Production / multi-user deployments
 * must use an API-backed provider (`gateway`, `anthropic`, `google`).
 *
 * Why this file lives under `apps/web/` instead of the repo root:
 * pnpm doesn't hoist workspace packages to the root, so a root-level
 * config can't resolve `@decoro/llm-config`. Keeping it next to the
 * Next.js app also lets it pick up `apps/web/.env.local` automatically.
 */
export const llm: LlmConfig = {
  provider: 'subprocess-codex',
  model: 'gpt-5.4',
};

/**
 * Design-system adapter binding. The rest of `apps/web` imports `adapter`
 * from this file rather than `@decoro/adapter-arte-odyssey` directly, so
 * pointing Decoro at a different design system is a one-line change here:
 * write your own `@your-org/adapter-<name>` implementing the `Adapter`
 * contract from `@decoro/adapter-spec`, then swap the import / export
 * below. No other code in `apps/web` needs to change.
 */
// Typed as `typeof arteOdysseyAdapter` (not the bare `Adapter` interface)
// so the registry's component type stays narrow — `Adapter` defaults
// `TComponent` to `unknown`, which json-render's `ComponentRegistry`
// would then refuse. Concrete adapter exports preserve the right
// specialization.
export const adapter = arteOdysseyAdapter;

/**
 * Share-snapshot configuration.
 *
 * `publicBaseUrl` is the absolute origin Decoro uses when generating
 * shareable URLs (e.g. `https://decoro.example.com`). Leave unset for
 * local dev — the share route then falls back to the request's
 * `X-Forwarded-Proto` + `X-Forwarded-Host` (or `Host`) headers, which
 * works for `pnpm dev` and most reverse-proxy setups. Set this
 * explicitly only if your proxy strips those headers, otherwise the
 * shared URL handed back to clients won't be reachable from outside.
 *
 * No trailing slash.
 */
export const share = {
  publicBaseUrl: process.env['DECORO_PUBLIC_BASE_URL'],
} as const;
