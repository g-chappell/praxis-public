import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // apps/web uses the `@/…` path alias (tsconfig paths); mirror it so component
  // tests resolve it the way Next does.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web', import.meta.url)),
    },
  },
  // Compile JSX with React's automatic runtime (matching Next) so component
  // tests don't need React in scope.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    include: ['**/*.{test,spec}.{ts,tsx,mjs,js}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'roadmap/**', '**/e2e/**'],
    passWithNoTests: true,
  },
});
