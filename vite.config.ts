import { base, fmt } from '@k8o/oxc-config';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    ...fmt,
    ignorePatterns: ['CHANGELOG.md', '.claude/**', 'pnpm-lock.yaml'],
  },
  lint: {
    extends: [base],
    ignorePatterns: ['CHANGELOG.md', '.claude/**'],
    options: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  staged: {
    '*.{js,ts,cjs,mjs,jsx,tsx,json,jsonc}': 'vp check --fix',
  },
});
