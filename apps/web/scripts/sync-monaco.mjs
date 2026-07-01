// Copy the Monaco editor assets (the ~16MB `vs/` bundle) out of node_modules
// into public/monaco-vs so the workspace editor self-hosts them — no runtime
// CDN dependency (ADR-0012). Wired as prebuild + predev, and into the Playwright
// webServer command, so the assets exist for build, dev, and e2e alike. The
// copied dir is gitignored; delete it to force a refresh after a monaco bump.

import { cp, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Resolve through the package manifest so pnpm's hoisting layout doesn't matter.
const src = resolve(dirname(require.resolve('monaco-editor/package.json')), 'min/vs');
const dest = resolve(webRoot, 'public/monaco-vs');

const force = process.argv.includes('--force');

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

if (!force && (await exists(resolve(dest, 'loader.js')))) {
  console.log('[sync-monaco] public/monaco-vs already present — skipping');
} else {
  await cp(src, dest, { recursive: true });
  console.log(`[sync-monaco] copied ${src} → ${dest}`);
}
