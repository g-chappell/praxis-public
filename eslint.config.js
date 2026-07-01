// Flat config — ESLint 9.x
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.vite/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'apps/web/public/monaco-vs/**',
      '.claude/**',
      'roadmap/yaml-lite.mjs',
      'packages/db/migrations/**',
      'packages/db/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.{mjs,js}', 'roadmap/**/*.mjs', 'apps/*/scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      // Repo scripts are JS, not TS — relax the TS-specific rules that don't apply.
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      sourceType: 'module',
    },
  },
];
