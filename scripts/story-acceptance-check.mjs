#!/usr/bin/env node
// story-acceptance-check.mjs — verify a Story's acceptance_criteria
// against the current branch's diff. Runs at Step 8.5 of /autonomous-run
// when the terminal task of a Story completes (story-remaining.mjs
// returned 0).
//
// Two layers:
//   1. SCRIPTED — grep the diff for high-confidence stub patterns. Same
//      patterns as stub-scan.mjs (the PostToolUse hook) — final-gate
//      catch for files written by scripts or via Bash, which bypass the
//      Write/Edit hook. Fast, deterministic.
//   2. LLM — spawn a scoped `claude` subprocess to evaluate the diff
//      against the Story's acceptance_criteria. Returns per-criterion
//      pass/fail. Catches the subtle cases the regex can't (no-op
//      functions, hardcoded values that should be dynamic, missing
//      branches the AC explicitly required).
//
// Both layers run. Redundancy is cheap; the failure mode is silent
// stubs reaching main.
//
// Usage:
//   node scripts/story-acceptance-check.mjs <STORY-ID>
//
// Output (JSON on stdout):
//   {
//     storyId, verdict: "pass" | "fail" | "unverifiable",
//     scripted: {stubHits: [...]},
//     llm: {verdict, perCriterion: [...], note?},
//     reason: <one-line summary>
//   }
//
// Exit codes:
//   0  verdict=pass    — Story AC verified; finalize-task.sh can stamp feature_complete=verified
//   1  verdict=fail    — at least one AC failed OR stub detected; treat as Step 8 failure
//   2  verdict=unverifiable — no AC on Story (legacy) OR LLM unavailable
//   3  infra error     — gh, claude, or roadmap unreadable
//
// Test escape hatch:
//   STORY_AC_FAKE_VERDICT=pass|fail|unverifiable — skips the LLM call
//   and uses the env value as the LLM verdict. Scripted layer still runs.

import { readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';
import { findStory } from '../roadmap/tree-index.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const YML = resolve(ROOT, 'roadmap/roadmap.yml');

// Mirror stub-scan.mjs's patterns. Looser is fine here — we're scanning
// the full branch diff (added lines), not live file content.
const STUB_PATTERNS = [
  {
    re: /['"`](Coming soon|TBD|lorem ipsum|placeholder text|placeholder string)['"`]/gi,
    label: 'placeholder string',
  },
  { re: /['"`][^'"`]*\(stub\)[^'"`]*['"`]/gi, label: '(stub) annotation' },
  {
    re: /throw\s+new\s+Error\s*\(\s*['"`](not implemented|TODO|stub|TBD)['"`]\s*\)/gi,
    label: 'not-implemented throw',
  },
  { re: /\b(TODO|FIXME|XXX)\b(?!\s*\(TASK-\d+\))/g, label: 'TODO/FIXME without TASK-id' },
];

// Allowlist for the LLM scoped subprocess. Observation-only: no Edit/Write.
const AC_TOOLS = 'Read,Grep,Glob,Bash(node *)';

function which(binary) {
  try {
    execSync(`command -v ${binary}`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

export function getBranchDiff() {
  try {
    return execSync('git diff origin/main...HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function scanDiffForStubs(diff) {
  if (!diff) return [];
  // Only inspect added lines (start with +, but not +++)
  const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const hits = [];
  for (const { re, label } of STUB_PATTERNS) {
    for (const line of addedLines) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (m) hits.push({ label, snippet: m[0], line: line.slice(1).trim() });
    }
  }
  return hits;
}

function buildPrompt(story, diff) {
  const acList = story.acceptance_criteria.map((ac, i) => `  ${i + 1}. ${ac}`).join('\n');
  const flowSection =
    story.user_flow && story.user_flow.length
      ? `\n# User flow (context)\n${story.user_flow.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n`
      : '';
  const oosSection =
    story.out_of_scope && story.out_of_scope.length
      ? `\n# Out of scope (NOT required by AC)\n${story.out_of_scope.map((s) => `  - ${s}`).join('\n')}\n`
      : '';
  return [
    `You are auditing Story \`${story.id}\` (${story.title}) for completeness.`,
    'For EACH acceptance criterion below, classify the diff as one of:',
    '  - "pass"          — the diff demonstrably implements this criterion',
    '  - "fail"          — the diff is silent on this criterion, or implements it incorrectly, or contains a stub/placeholder where the real implementation should be',
    '  - "unverifiable"  — the criterion is about runtime behaviour that can\'t be confirmed from the diff alone (e.g. needs a manual test run)',
    '',
    'Use Read/Grep/Glob to inspect referenced files for evidence. Do NOT edit anything.',
    'A "stub" is: hardcoded placeholder strings ("Coming soon"), UI rendered with mock data, TODO/FIXME without a TASK-NNN reference, throw "not implemented", or a no-op function the caller expects to do real work.',
    '',
    '# Story acceptance criteria',
    acList,
    flowSection,
    oosSection,
    '',
    '# Diff (vs origin/main)',
    '```diff',
    diff.slice(0, 100_000), // cap at 100k chars
    '```',
    '',
    'Return your verdict as JSON only (no prose, no markdown fences):',
    '{',
    '  "verdict": "pass" | "fail" | "unverifiable",',
    '  "perCriterion": [',
    '    {"criterion": "<verbatim AC text>", "status": "pass" | "fail" | "unverifiable", "evidence": "<file:line or test name or one-sentence reason>"}',
    '  ]',
    '}',
    '',
    'Aggregation rule: if ANY criterion is "fail", overall verdict is "fail". If ALL are "pass", overall is "pass". Otherwise "unverifiable".',
  ].join('\n');
}

export function llmVerdict(story, diff) {
  if (process.env.STORY_AC_FAKE_VERDICT) {
    const v = process.env.STORY_AC_FAKE_VERDICT;
    return {
      verdict: v,
      perCriterion: story.acceptance_criteria.map((c) => ({
        criterion: c,
        status: v,
        evidence: 'STORY_AC_FAKE_VERDICT',
      })),
      note: 'faked via STORY_AC_FAKE_VERDICT',
    };
  }
  if (!which('claude')) {
    return {
      verdict: 'unverifiable',
      perCriterion: [],
      note: 'claude CLI not on PATH; LLM acceptance check skipped',
    };
  }

  const prompt = buildPrompt(story, diff || '(no diff available)');
  // Scope tools read-only via --allowed-tools rather than bypassing permissions
  // wholesale. In headless `-p` mode any tool outside the allowlist is
  // auto-denied (not prompted), so the run stays non-interactive — and unlike
  // --dangerously-skip-permissions it works under root, which refuses that flag.
  const args = ['--allowed-tools', AC_TOOLS, '-p', prompt];
  const result = spawnSync('claude', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000, // 5 minute cap
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      verdict: 'unverifiable',
      perCriterion: [],
      note: `claude exit=${result.status}; stderr=${(result.stderr || '').slice(-300)}`,
    };
  }
  // Extract JSON from stdout. Claude may wrap in prose despite instructions —
  // find the first { ... } block.
  const out = (result.stdout || '').trim();
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      verdict: 'unverifiable',
      perCriterion: [],
      note: `no JSON object in claude output; raw: ${out.slice(0, 200)}`,
    };
  }
  try {
    const parsed = JSON.parse(m[0]);
    return {
      verdict: parsed.verdict || 'unverifiable',
      perCriterion: Array.isArray(parsed.perCriterion) ? parsed.perCriterion : [],
    };
  } catch (e) {
    return {
      verdict: 'unverifiable',
      perCriterion: [],
      note: `JSON parse error: ${e.message}`,
    };
  }
}

function main() {
  const storyId = process.argv[2];
  if (!storyId) {
    process.stderr.write('story-acceptance-check: STORY-id required\n');
    process.exit(3);
  }

  let roadmap;
  try {
    roadmap = parse(readFileSync(YML, 'utf8'));
  } catch (e) {
    process.stderr.write(`story-acceptance-check: cannot parse roadmap: ${e.message}\n`);
    process.exit(3);
  }

  const found = findStory(roadmap, storyId);
  if (!found) {
    process.stderr.write(`story-acceptance-check: ${storyId} not found in roadmap\n`);
    process.exit(3);
  }
  const { story } = found;

  if (!story.acceptance_criteria || story.acceptance_criteria.length === 0) {
    const result = {
      storyId,
      verdict: 'unverifiable',
      reason: 'no_acceptance_criteria (legacy Story — feature_complete stays pending)',
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(2);
  }

  const diff = getBranchDiff();

  // 1. Scripted layer — fail-fast on stub hits
  const stubHits = scanDiffForStubs(diff);
  const scripted = { stubHits };
  if (stubHits.length > 0) {
    const result = {
      storyId,
      verdict: 'fail',
      scripted,
      llm: null,
      reason: `stub_detected_in_diff: ${stubHits[0].label}`,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(1);
  }

  // 2. LLM layer
  const llm = llmVerdict(story, diff);
  const overall =
    llm.verdict === 'pass' ? 'pass' : llm.verdict === 'fail' ? 'fail' : 'unverifiable';

  const result = {
    storyId,
    verdict: overall,
    scripted,
    llm,
    reason:
      overall === 'pass'
        ? 'all_ac_verified'
        : overall === 'fail'
          ? `ac_failed: ${(llm.perCriterion.find((c) => c.status === 'fail') || {}).criterion || 'unknown'}`
          : `unverifiable: ${llm.note || 'see llm.perCriterion'}`,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(overall === 'pass' ? 0 : overall === 'fail' ? 1 : 2);
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main();
