// eslint.config.js — R10 (docs/work-order-2026-07-22.md). Flat config,
// deliberately narrow: catches real bugs (unused vars, undefined refs,
// unreachable code) without imposing a style opinion this session's own
// mass-reformat would fight — see the R10 commit message for why no
// `eslint --fix` or `prettier --write` was run across the existing tree.
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        Worker: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Event: 'readonly',
        HTMLInputElement: 'readonly',
        performance: 'readonly',
        Path2D: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'out/', 'scratch/', 'Archive/'],
  },
];
