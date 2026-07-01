#!/usr/bin/env node
// run-workspaces.mjs — run an npm script across all workspaces, or no-op if
// no workspace directories exist yet. Used by root package.json's typecheck,
// test, and build scripts.
//
// Why: `npm run <script> --workspaces --if-present` errors with
// "No workspaces found!" when the `apps/*` / `packages/*` glob matches
// nothing — even with --if-present. This wrapper guards on presence so a
// freshly-spawned project (no apps/ or packages/ yet) doesn't fail every
// validation step out of the gate.

import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const script = process.argv[2];
if (!script) {
  console.error('usage: run-workspaces.mjs <script>');
  process.exit(2);
}

const hasAnyWorkspace = ['apps', 'packages'].some(
  (dir) =>
    existsSync(dir) &&
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .some((d) => existsSync(join(dir, d.name, 'package.json'))),
);

if (!hasAnyWorkspace) {
  console.info(`no workspaces yet — skipping "${script}"`);
  process.exit(0);
}

const res = spawnSync('npm', ['run', script, '--workspaces', '--if-present', '--silent'], {
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
