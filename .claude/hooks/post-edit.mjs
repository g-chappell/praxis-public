#!/usr/bin/env node
// post-edit.mjs — NO-OP.
//
// This per-edit typecheck hook was UNWIRED from .claude/settings.json in #202
// (the per-edit `pnpm typecheck` child spawned here was the source of timeout and
// `cjs/loader` "hook error" noise). The file is kept as a harmless no-op rather
// than deleted, because a session that loaded the hook config *before* #202 still
// invokes `node .claude/hooks/post-edit.mjs` from stale in-memory config — and
// deleting the file would turn that into a "Cannot find module" error. Exiting 0
// immediately makes those stale invocations harmless. Typecheck coverage lives in
// the dev flow + CI; see #195/#202 for the rationale.
process.exit(0);
