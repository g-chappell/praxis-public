#!/usr/bin/env node
// migrate-story-ac.mjs — backfill acceptance_criteria on legacy Stories.
//
// Walks a project's roadmap.yml, finds Stories whose acceptance_criteria
// is missing or empty, and either:
//   - drafts AC via a scoped `claude` subprocess (--from-claude), OR
//   - prints the Stories so the user can edit roadmap.yml directly.
//
// Without acceptance_criteria, the autonomous cycle's Step 8.5 can't run
// and the Story will sit at `feature_complete: pending` forever. This
// script is the one-time migration for projects that adopted the
// feature-first schema after their roadmap was already populated.
//
// Usage:
//   node scripts/migrate-story-ac.mjs                # list Stories needing AC
//   node scripts/migrate-story-ac.mjs --from-claude --dry-run   # preview
//   node scripts/migrate-story-ac.mjs --from-claude             # apply
//   node scripts/migrate-story-ac.mjs path/to/roadmap.yml --from-claude  # external project
//
// Flags:
//   --from-claude   draft AC via a scoped claude subprocess (Read,Grep,Glob)
//   --dry-run       print proposed AC without writing
//   --root <dir>    override project root (default: derived from script location)
//
// Exit codes:
//   0  success (no work needed, dry-run completed, or write succeeded)
//   1  bad args / IO error / claude CLI missing when --from-claude
//   2  validation failed after write (file left as-is for inspection)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SELF_DIR, '..');

const AC_TOOLS = 'Read,Grep,Glob';

function parseArgs(argv) {
  const args = { ymlPath: null, fromClaude: false, dryRun: false, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from-claude') {
      args.fromClaude = true;
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (a === '--root') {
      args.root = argv[++i];
      continue;
    }
    if (!a.startsWith('-') && !args.ymlPath) {
      args.ymlPath = a;
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function which(binary) {
  try {
    execSync(`command -v ${binary}`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function findStoriesNeedingAC(roadmap) {
  const needs = [];
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      if (!story.acceptance_criteria || story.acceptance_criteria.length === 0) {
        needs.push({ epic, story });
      }
    }
  }
  return needs;
}

function buildClaudePrompt(epic, story) {
  const taskLines = (story.tasks || [])
    .map((t) => {
      const desc = t.description
        ? '\n      ' + String(t.description).split('\n').join('\n      ').trim()
        : '';
      return `  - ${t.id}: ${t.title}${desc}`;
    })
    .join('\n');
  return [
    'You are backfilling acceptance_criteria for an existing Story in an',
    'autonomous-dev project roadmap. Based on the tasks below, draft 1-3',
    'acceptance criteria that describe the OBSERVABLE behaviour that exists',
    'when ALL tasks under this Story are done.',
    '',
    'Guidelines:',
    '- User-facing Stories: use user-visible language ("user can X", "X shows Y")',
    '- Backend Stories: use contract language ("endpoint returns 200 with shape X",',
    '  "migration is idempotent", "rate-limit triggers at N req/s")',
    '- Each AC should be testable / observable, not implementation detail',
    '- Prefer 1-2 strong AC over 5 weak ones',
    '',
    `Story: ${story.id} — ${story.title}`,
    `Epic:  ${epic.id} — ${epic.title}`,
    story.description
      ? `Description:\n  ${String(story.description).split('\n').join('\n  ').trim()}`
      : '',
    '',
    `Tasks (${(story.tasks || []).length}):`,
    taskLines,
    '',
    'Return JSON only (no prose, no markdown fences):',
    '{',
    '  "acceptance_criteria": ["criterion 1", "criterion 2"],',
    '  "rationale": "<one-line why these are the right AC>"',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

function draftACWithClaude(epic, story) {
  const prompt = buildClaudePrompt(epic, story);
  const result = spawnSync(
    'claude',
    ['--dangerously-skip-permissions', '--allowed-tools', AC_TOOLS, '-p', prompt],
    {
      encoding: 'utf8',
      timeout: 3 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    return { error: `claude exit=${result.status}: ${(result.stderr || '').slice(-200)}` };
  }
  const out = (result.stdout || '').trim();
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return { error: `no JSON in claude output (raw: ${out.slice(0, 150)})` };
  try {
    const parsed = JSON.parse(m[0]);
    return {
      ac: Array.isArray(parsed.acceptance_criteria) ? parsed.acceptance_criteria : [],
      rationale: parsed.rationale || '',
    };
  } catch (e) {
    return { error: `JSON parse: ${e.message}` };
  }
}

// Insert (or replace) the acceptance_criteria block on a Story. Uses
// line-based mutation to preserve the rest of the file byte-for-byte.
export function insertACBlock(lines, storyId, acceptanceCriteria) {
  const idRe = new RegExp(`^(\\s*)-\\s+id:\\s+${storyId}\\b`);
  let storyStart = -1;
  let baseIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(idRe);
    if (m) {
      storyStart = i;
      baseIndent = m[1].length;
      break;
    }
  }
  if (storyStart < 0) return false;

  let storyEnd = lines.length;
  for (let i = storyStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const ind = line.match(/^( *)/)[1].length;
    if (ind <= baseIndent) {
      storyEnd = i;
      break;
    }
  }

  const childIndent = baseIndent + 2;
  const itemIndent = childIndent + 2;

  // Build the block to insert
  const newBlock = [`${' '.repeat(childIndent)}acceptance_criteria:`];
  for (const ac of acceptanceCriteria) {
    newBlock.push(`${' '.repeat(itemIndent)}- '${String(ac).replace(/'/g, "''")}'`);
  }

  // If acceptance_criteria already exists, replace it (the line plus any
  // contiguous list items at itemIndent).
  const acRe = new RegExp(`^ {${childIndent}}acceptance_criteria\\s*:`);
  for (let i = storyStart; i < storyEnd; i++) {
    if (acRe.test(lines[i])) {
      // Determine extent of existing AC block: the header line plus any
      // following lines at itemIndent that are list items (`- ...`).
      let end = i + 1;
      while (end < storyEnd) {
        const line = lines[end];
        if (line.trim() === '') {
          end++;
          continue;
        }
        const ind = line.match(/^( *)/)[1].length;
        if (ind === itemIndent && line.trim().startsWith('-')) {
          end++;
          continue;
        }
        break;
      }
      lines.splice(i, end - i, ...newBlock);
      return true;
    }
  }

  // Doesn't exist — insert. Find best position: after `description` (incl.
  // block scalar continuation) or after `title`.
  let insertAt = storyStart + 1;
  for (const key of ['description', 'title']) {
    const re = new RegExp(`^ {${childIndent}}${key}\\s*:`);
    let last = -1;
    for (let i = storyStart; i < storyEnd; i++) {
      if (re.test(lines[i])) last = i;
    }
    if (last >= 0) {
      let j = last + 1;
      while (j < storyEnd) {
        const line = lines[j];
        if (line.trim() === '') {
          j++;
          continue;
        }
        const ind = line.match(/^( *)/)[1].length;
        if (ind > childIndent) {
          j++;
          continue;
        }
        break;
      }
      insertAt = j;
      break;
    }
  }
  lines.splice(insertAt, 0, ...newBlock);
  return true;
}

function printStorySummary(epic, story) {
  process.stdout.write(`\n=== ${story.id} — ${story.title} ===\n`);
  process.stdout.write(`Epic: ${epic.id} — ${epic.title}\n`);
  if (story.description) {
    const d = String(story.description).split('\n').join(' ').trim();
    process.stdout.write(`Description: ${d.slice(0, 200)}${d.length > 200 ? '…' : ''}\n`);
  }
  const tasks = story.tasks || [];
  process.stdout.write(`Tasks (${tasks.length}):\n`);
  for (const t of tasks.slice(0, 8)) {
    process.stdout.write(`  - ${t.id}: ${t.title}\n`);
  }
  if (tasks.length > 8) process.stdout.write(`  ... and ${tasks.length - 8} more\n`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`migrate-story-ac: ${e.message}\n`);
    process.exit(1);
  }

  const root = args.root ? resolve(args.root) : DEFAULT_ROOT;
  const ymlPath = args.ymlPath
    ? existsSync(args.ymlPath)
      ? resolve(args.ymlPath)
      : resolve(root, args.ymlPath)
    : resolve(root, 'roadmap/roadmap.yml');

  if (!existsSync(ymlPath)) {
    process.stderr.write(`migrate-story-ac: ${ymlPath} not found\n`);
    process.exit(1);
  }

  const originalText = readFileSync(ymlPath, 'utf8');
  const roadmap = parse(originalText);
  const needs = findStoriesNeedingAC(roadmap);

  if (needs.length === 0) {
    process.stdout.write('All Stories have acceptance_criteria. Nothing to migrate.\n');
    process.exit(0);
  }

  process.stdout.write(
    `Found ${needs.length} Stories needing acceptance_criteria (out of ${(
      roadmap.epics || []
    ).reduce((n, e) => n + (e.stories || []).length, 0)} total).\n`,
  );

  if (!args.fromClaude) {
    // Informational only — list the Stories.
    process.stdout.write(
      '\nRun with --from-claude to draft AC automatically, or edit roadmap.yml manually.\n',
    );
    for (const { epic, story } of needs) {
      printStorySummary(epic, story);
    }
    process.exit(0);
  }

  if (!which('claude')) {
    process.stderr.write('--from-claude specified but `claude` CLI is not on PATH\n');
    process.exit(1);
  }

  const lines = originalText.split('\n');
  let mutated = 0;
  const failures = [];

  for (const [i, { epic, story }] of needs.entries()) {
    process.stdout.write(`\n[${i + 1}/${needs.length}] ${story.id} — ${story.title}\n`);
    const result = draftACWithClaude(epic, story);
    if (result.error) {
      process.stdout.write(`  SKIP — ${result.error}\n`);
      failures.push({ storyId: story.id, error: result.error });
      continue;
    }
    if (!result.ac || result.ac.length === 0) {
      process.stdout.write(`  SKIP — claude returned no AC\n`);
      failures.push({ storyId: story.id, error: 'empty AC' });
      continue;
    }
    process.stdout.write(`  Proposed AC:\n`);
    for (const ac of result.ac) process.stdout.write(`    - ${ac}\n`);
    if (result.rationale) process.stdout.write(`  Rationale: ${result.rationale}\n`);

    if (args.dryRun) continue;

    const ok = insertACBlock(lines, story.id, result.ac);
    if (ok) {
      mutated++;
    } else {
      process.stdout.write(`  ERROR — failed to locate ${story.id} block in YAML\n`);
      failures.push({ storyId: story.id, error: 'block lookup failed' });
    }
  }

  if (args.dryRun) {
    process.stdout.write(
      `\n[dry-run] No changes written. ${needs.length} Stories evaluated, ${failures.length} would be skipped.\n`,
    );
    process.exit(0);
  }

  if (mutated === 0) {
    process.stdout.write(`\nNo Stories were updated. ${failures.length} failed (see above).\n`);
    process.exit(0);
  }

  const newText = lines.join('\n');
  writeFileSync(ymlPath, newText);
  process.stdout.write(`\nWrote ${mutated} Stories to ${ymlPath}\n`);
  if (failures.length > 0) {
    process.stdout.write(
      `${failures.length} Stories skipped (re-run on those, or fill in manually):\n`,
    );
    for (const f of failures) process.stdout.write(`  - ${f.storyId}: ${f.error}\n`);
  }

  // Validate
  try {
    execSync(`node "${resolve(root, 'roadmap/validate.mjs')}"`, {
      cwd: root,
      stdio: 'inherit',
    });
  } catch {
    process.stderr.write(
      `\nWARNING: validate failed after migration. File written; restore from git if needed.\n`,
    );
    process.exit(2);
  }
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) {
  main().catch((e) => {
    console.error('FAIL:', e.stack);
    process.exit(1);
  });
}
