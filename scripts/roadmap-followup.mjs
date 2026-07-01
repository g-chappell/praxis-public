#!/usr/bin/env node
// roadmap-followup.mjs — append new tasks under the same Story as a
// parent task. Called by the autonomous cycle's Step 7 when the agent
// discovers that completing the current task without a stub requires
// additional follow-up work.
//
// Each new task is created with `followup_of: <parent-TASK-id>` so the
// select-task.mjs picker picks them first in the next cycle, ahead of
// any unrelated work (stubs in unfinished features affect downstream
// tasks — drain the follow-up queue before touching anything else).
//
// Usage:
//   node scripts/roadmap-followup.mjs <PARENT-TASK-ID> \
//        --reason "<one line>" \
//        --add-tasks "<title>;<title>;..." \
//        [--dry-run]
//
// Output (stdout, JSON):
//   { addedTaskIds: [...], parentTask: "...", storyId: "...", reason: "..." }
//
// Exit codes:
//   0  success
//   1  bad args
//   2  parent task not found
//   3  validation failed after insert (file reverted)

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';
import { findTaskBlock } from './roadmap-update-task.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const YML = resolve(ROOT, 'roadmap/roadmap.yml');

export function parseArgs(argv) {
  const args = { parentTaskId: null, reason: null, addTasks: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!args.parentTaskId && !a.startsWith('-')) {
      args.parentTaskId = a;
      continue;
    }
    if (a === '--reason') {
      args.reason = argv[++i];
      continue;
    }
    if (a === '--add-tasks') {
      args.addTasks = argv[++i]
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (a === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
  }
  if (!args.parentTaskId) throw new Error('parent TASK-id required as first positional arg');
  if (args.addTasks.length === 0) throw new Error('--add-tasks "<title>;<title>" required');
  return args;
}

export function findTaskInfo(roadmap, taskId) {
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      for (const task of story.tasks || []) {
        if (task.id === taskId) return { task, story, epic };
      }
    }
  }
  return null;
}

export function computeNextTaskNum(roadmap) {
  let max = 0;
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      for (const task of story.tasks || []) {
        const m = String(task.id).match(/^TASK-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
    }
  }
  return max + 1;
}

export function buildTaskBlock(opts) {
  const { id, title, priority, complexity, parentTaskId, baseIndent } = opts;
  const pad = ' '.repeat(baseIndent);
  const childPad = ' '.repeat(baseIndent + 2);
  return [
    `${pad}- id: ${id}`,
    `${childPad}title: '${String(title).replace(/'/g, "''")}'`,
    `${childPad}status: ready`,
    `${childPad}priority: ${priority}`,
    `${childPad}complexity: ${complexity}`,
    `${childPad}workspaces: []`,
    `${childPad}description: null`,
    `${childPad}depends_on: ['${parentTaskId}']`,
    `${childPad}pr: null`,
    `${childPad}completed: null`,
    `${childPad}blocked_reason: null`,
    `${childPad}last_attempted: null`,
    `${childPad}attempt_count: 0`,
    `${childPad}task_acceptance: null`,
    `${childPad}is_terminal: false`,
    `${childPad}followup_of: ${parentTaskId}`,
  ];
}

// Find the insertion line — the index just AFTER the last task at the
// same indent level as the parent's `- id:` line (i.e. the end of the
// parent Story's tasks list).
export function findInsertLine(lines, parentBlock) {
  const { baseIndent } = parentBlock;
  let insertAt = lines.length;
  for (let i = parentBlock.end; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const ind = line.match(/^( *)/)[1].length;
    if (ind === baseIndent && /^\s*-\s+id:\s+TASK-/.test(line)) {
      // sibling task — skip over it via findTaskBlock and resume
      const sub = findTaskBlock(lines, line.match(/TASK-\d+/)[0]);
      if (sub && sub.end > i) {
        i = sub.end - 1;
        continue;
      }
      continue;
    }
    // Anything else (next story, next epic, EOF) → insert here
    insertAt = i;
    break;
  }
  return insertAt;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`roadmap-followup: ${e.message}\n`);
    process.exit(1);
  }

  const originalText = readFileSync(YML, 'utf8');
  const roadmap = parse(originalText);
  const info = findTaskInfo(roadmap, args.parentTaskId);
  if (!info) {
    process.stderr.write(`roadmap-followup: ${args.parentTaskId} not found in roadmap\n`);
    process.exit(2);
  }

  const lines = originalText.split('\n');
  const parentBlock = findTaskBlock(lines, args.parentTaskId);
  if (!parentBlock) {
    process.stderr.write(`roadmap-followup: line-level lookup failed for ${args.parentTaskId}\n`);
    process.exit(2);
  }

  const insertAt = findInsertLine(lines, parentBlock);
  const startNum = computeNextTaskNum(roadmap);
  const newBlockLines = [];
  const addedIds = [];
  for (let i = 0; i < args.addTasks.length; i++) {
    const id = `TASK-${String(startNum + i).padStart(3, '0')}`;
    addedIds.push(id);
    newBlockLines.push(
      ...buildTaskBlock({
        id,
        title: args.addTasks[i],
        priority: info.task.priority || 'med',
        complexity: info.task.complexity || 'small',
        parentTaskId: args.parentTaskId,
        baseIndent: parentBlock.baseIndent,
      }),
    );
  }
  lines.splice(insertAt, 0, ...newBlockLines);
  const newText = lines.join('\n');

  if (args.dryRun) {
    process.stdout.write(newText);
    return;
  }

  writeFileSync(YML, newText);

  // Validate; revert + exit 3 on failure.
  try {
    execSync('node roadmap/validate.mjs', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
  } catch (e) {
    writeFileSync(YML, originalText);
    const stderr = (e.stderr || '').toString();
    process.stderr.write(`roadmap-followup: validation failed after insert; reverted\n${stderr}\n`);
    process.exit(3);
  }

  // Re-render ROADMAP.md (best-effort).
  try {
    execSync('node roadmap/render.mjs', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
  } catch (e) {
    process.stderr.write(`roadmap-followup: render failed (non-fatal): ${e.message}\n`);
  }

  process.stdout.write(
    JSON.stringify({
      addedTaskIds: addedIds,
      parentTask: args.parentTaskId,
      storyId: info.story.id,
      reason: args.reason || '(unspecified)',
    }) + '\n',
  );
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main();
