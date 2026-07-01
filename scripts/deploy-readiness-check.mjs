#!/usr/bin/env node
// deploy-readiness-check.mjs — catch the deploy-layer failures that CI's
// in-process build can't see, BEFORE they crash-loop in production.
//
// Born from STORY-07: a deployable (apps/web, services/orchestrator) gained a
// workspace dependency (@praxis/crypto, @praxis/sandbox) but its Dockerfile
// didn't COPY the package, so the image built fine in CI (full monorepo) yet
// died at runtime ("ENOENT … @praxis/sandbox"). Services with no build step
// (Bun runs TS natively) have no compile-time net at all.
//
// Two layers, like story-acceptance-check.mjs:
//   1. SCRIPTED — for each deployable with a Dockerfile, every `workspace:*`
//      dependency MUST be COPY'd (manifest into the deps layer + source into
//      the build layer). Deterministic; the high-value gate. Runs in CI.
//   2. LLM — judge the branch diff for the fuzzier deploy risks the regex
//      can't see: new required env vars, new host-resource needs (Docker
//      socket, ports, volumes, group perms), systemd unit changes needing a
//      manual re-apply. Advisory + gating on high-confidence blockers.
//
// Usage:
//   node scripts/deploy-readiness-check.mjs                 # both layers
//   node scripts/deploy-readiness-check.mjs --scripted-only # CI: layer 1 only
//
// Exit codes:
//   0  ready          — no scripted gaps; no high-confidence LLM blocker
//   1  not ready      — a workspace dep isn't COPY'd, or the LLM flagged a blocker
//   2  unverifiable   — LLM unavailable (scripted layer still ran and passed)
//   3  infra error    — repo unreadable

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');

const SCRIPTED_ONLY = process.argv.includes('--scripted-only');

// Workspace roots that can hold deployables / packages.
const WORKSPACE_GLOBS = ['apps', 'services', 'packages', 'templates', 'infrastructure'];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ----- pure, unit-tested helpers -----

/** Does the Dockerfile COPY the package's manifest into the deps layer? */
export function copiesManifest(dockerfile, pkgPath) {
  return dockerfile.includes(`${pkgPath}/package.json`);
}

/** Does the Dockerfile COPY the package's source directory? Matches
 *  `COPY <path> <dest>` (optionally `<path>/`) but NOT the `<path>/package.json`
 *  manifest line. */
export function copiesSource(dockerfile, pkgPath) {
  return new RegExp(`^COPY\\s+${escapeRegExp(pkgPath)}/?\\s`, 'm').test(dockerfile);
}

/** Given a Dockerfile's text and the deployable's workspace deps
 *  ([{name, path}]), return the ones not fully COPY'd. */
export function findUncopiedDeps(dockerfile, deps) {
  const missing = [];
  for (const dep of deps) {
    const manifest = copiesManifest(dockerfile, dep.path);
    const source = copiesSource(dockerfile, dep.path);
    if (!manifest || !source) missing.push({ ...dep, manifest, source });
  }
  return missing;
}

// ----- discovery -----

/** Map every workspace package name → its repo-relative path. */
function workspacePackages() {
  const byName = new Map();
  for (const glob of WORKSPACE_GLOBS) {
    const base = join(ROOT, glob);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = `${glob}/${entry.name}`;
      const pkgJson = join(ROOT, rel, 'package.json');
      if (!existsSync(pkgJson)) continue;
      try {
        const { name } = JSON.parse(readFileSync(pkgJson, 'utf8'));
        if (name) byName.set(name, rel);
      } catch {
        /* skip unparseable */
      }
    }
  }
  return byName;
}

/** Deployables = apps/* and services/* that ship a Dockerfile. */
function deployables() {
  const out = [];
  for (const glob of ['apps', 'services']) {
    const base = join(ROOT, glob);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = `${glob}/${entry.name}`;
      if (existsSync(join(ROOT, rel, 'Dockerfile'))) out.push(rel);
    }
  }
  return out;
}

function scriptedLayer() {
  const names = workspacePackages();
  const findings = [];
  for (const svc of deployables()) {
    const pkg = JSON.parse(readFileSync(join(ROOT, svc, 'package.json'), 'utf8'));
    const dockerfile = readFileSync(join(ROOT, svc, 'Dockerfile'), 'utf8');
    const deps = Object.entries(pkg.dependencies ?? {})
      .filter(([, v]) => typeof v === 'string' && v.startsWith('workspace:'))
      .map(([name]) => ({ name, path: names.get(name) }))
      .filter((d) => d.path); // only deps we can resolve to a path
    for (const m of findUncopiedDeps(dockerfile, deps)) {
      findings.push({
        service: svc,
        dep: m.name,
        path: m.path,
        reason:
          !m.manifest && !m.source
            ? 'not copied'
            : !m.manifest
              ? 'manifest not copied'
              : 'source not copied',
      });
    }
  }
  return findings;
}

// ----- LLM layer -----

function which(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function branchDiff() {
  try {
    return execSync('git diff origin/main...HEAD', {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

const LLM_TOOLS = 'Read,Grep,Glob,Bash(node *)';

function llmLayer(diff) {
  if (process.env.DEPLOY_READY_FAKE_VERDICT) {
    return { verdict: process.env.DEPLOY_READY_FAKE_VERDICT, findings: [], note: 'faked' };
  }
  if (!which('claude')) {
    return { verdict: 'unverifiable', findings: [], note: 'claude CLI not on PATH' };
  }
  const prompt = [
    'You are a release engineer checking a branch diff for DEPLOY-LAYER risks',
    'that in-process CI (which builds in the full monorepo) cannot catch.',
    'Praxis deploys apps/web + services/orchestrator as Docker images on a VPS',
    'via systemd; the orchestrator runs Bun (no build step, so missing deps fail',
    'only at runtime). Flag ONLY concrete, high-confidence deploy blockers:',
    '  - a new required env var (process.env.X) not plumbed into the env-file / unit',
    '  - a new host-resource need: Docker socket, published port, volume, or a',
    '    group/permission the container user lacks',
    '  - a systemd unit (.service) change that needs a manual re-apply on the VPS',
    '    (the deploy restarts but does NOT copy the unit file)',
    '  - a runtime-only dependency a no-build service imports but the image lacks',
    'Do NOT flag style, tests, or in-process concerns. Be conservative: "risk"',
    'means you are confident it will break or degrade the deploy.',
    '',
    '# Diff (vs origin/main)',
    '```diff',
    diff.slice(0, 100_000),
    '```',
    '',
    'Return JSON only: {"verdict":"ready"|"risk"|"unverifiable","findings":[{"area":"...","severity":"high"|"med","detail":"..."}]}',
  ].join('\n');

  const res = spawnSync('claude', ['--allowed-tools', LLM_TOOLS, '-p', prompt], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (res.status !== 0) {
    return { verdict: 'unverifiable', findings: [], note: `claude exit=${res.status}` };
  }
  const m = (res.stdout || '').match(/\{[\s\S]*\}/);
  if (!m) return { verdict: 'unverifiable', findings: [], note: 'no JSON in claude output' };
  try {
    const parsed = JSON.parse(m[0]);
    return { verdict: parsed.verdict ?? 'unverifiable', findings: parsed.findings ?? [] };
  } catch {
    return { verdict: 'unverifiable', findings: [], note: 'unparseable claude JSON' };
  }
}

// ----- main -----

function main() {
  let scripted;
  try {
    scripted = scriptedLayer();
  } catch (err) {
    process.stderr.write(`deploy-readiness-check: infra error — ${err.message}\n`);
    process.exit(3);
  }

  const llm = SCRIPTED_ONLY ? { verdict: 'skipped', findings: [] } : llmLayer(branchDiff());

  // Gate on scripted gaps (deterministic) and high-severity LLM findings only.
  // `med` LLM findings are advisory — printed, but they don't fail the check.
  const highRisk = (llm.findings ?? []).filter((f) => f.severity === 'high');
  const blocked = scripted.length > 0 || highRisk.length > 0;

  const result = {
    ready: !blocked,
    scripted,
    llm: SCRIPTED_ONLY ? { verdict: 'skipped' } : llm,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  for (const f of scripted) {
    process.stderr.write(
      `::error::${f.service}/Dockerfile does not COPY workspace dep ${f.dep} (${f.path}) — ${f.reason}\n`,
    );
  }
  for (const f of highRisk) {
    process.stderr.write(`::error::deploy risk [${f.area}] ${f.detail}\n`);
  }

  if (blocked) process.exit(1);
  if (!SCRIPTED_ONLY && llm.verdict === 'unverifiable') process.exit(2);
  process.exit(0);
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main();
