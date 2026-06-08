import { fmt, nextjs, tailwind, test } from '@k8o/oxc-config';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    ...fmt,
    ignorePatterns: [
      'CHANGELOG.md',
      '.claude/**',
      'pnpm-lock.yaml',
      '**/.next/**',
    ],
  },
  lint: {
    extends: [nextjs, tailwind],
    ignorePatterns: ['CHANGELOG.md', '.claude/**', '**/.next/**'],
    options: {
      reportUnusedDisableDirectives: 'error',
    },
    settings: {
      react: { version: '19.2.7' },
      // oxlint-tailwindcss v1 requires the Tailwind entry CSS so it can
      // resolve the theme / which utilities are valid. Only apps/web uses
      // Tailwind, so a single entry point covers the monorepo.
      tailwindcss: {
        entryPoint: 'apps/web/src/app/globals.css',
      },
    },
    overrides: [
      {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        plugins: [...(test.plugins ?? [])],
        rules: test.rules ?? {},
        env: { jest: true },
      },
    ],
  },
  staged: {
    '*.{js,ts,cjs,mjs,jsx,tsx,json,jsonc}': 'vp check --fix',
  },
});
