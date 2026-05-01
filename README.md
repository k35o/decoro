# Decoro

> Italian for "decoration, dignity, refinement."
> A tool for collaboratively creating UI clad in your own design system, in real time, by talking to AI.

## What is this

Decoro is a **self-hosted web app** that gives teams the experience of **creating UI together by discussing it on the spot, and turning that into real implementation**.

In a meeting, designers, PMs, and engineers look at the same screen and say things like "build me a login form" or "give it more breathing room." UI is generated and modified live, using your real design system. The output is not a reference implementation — it is **code you can drop into the real codebase**.

## What problem it solves

Existing AI UI-generation tools like v0 and stitch are locked to specific stacks (shadcn/ui, Tailwind, etc.). For teams with their own design system, the output is at best a reference implementation.

Decoro aims to work with **any component library, design tokens, and styling system**. The first target is [@k8o/arte-odyssey](https://github.com/k35o/ArteOdyssey).

## Try the MVP

Requirements: `mise` (or matching Node 24 / pnpm 10), and a Google Gemini API key (free tier from <https://aistudio.google.com/apikey>) or an Anthropic / Vercel AI Gateway key.

```bash
git clone git@github.com:k35o/decoro.git
cd decoro
mise install                       # provisions Node + pnpm
pnpm install
echo "GOOGLE_GENERATIVE_AI_API_KEY=AIza…" > apps/web/.env.local
pnpm dev                           # http://localhost:3000
```

In the chat box, try a sequence like:

1. `build a primary submit button labeled Save`
2. `wrap it in a card`
3. `make the button outlined instead`

Each turn updates the live ArteOdyssey preview on the right and the generated TSX panel below it. Click **Copy** on the code panel and paste into a fresh React + Tailwind project that has `@k8o/arte-odyssey` installed — the same UI renders.

The catalog ships with **Button and Card only** for the MVP value-validation pass. Full ArteOdyssey component coverage and layout primitives are first-release work tracked in the local `docs/mvp-scope.md`.

To use a different LLM provider, edit `apps/web/decoro.config.ts` (Anthropic and Vercel AI Gateway are already wired) and set the matching env var listed in `.env.example`.

## Status

MVP complete (M1–M10): the live chat → preview → TSX flow runs end to end against any of three LLM providers. Public release work — full component coverage, deploy guide, security hardening — is next.
