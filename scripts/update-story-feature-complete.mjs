#!/usr/bin/env node
// update-story-feature-complete.mjs — stamp a Story's feature_complete
// and verified_at fields after the Step 8.5 acceptance check resolves.
//
// Looks up the Story that owns the given Task (via tree-index), then
// rewrites the Story block's `feature_complete:` and `verified_at:` lines.
// If the fields don't exist on the Story (legacy YAML), inserts them
// right after the Story's `description:` line (or after `id:` if no
// description).
//
// Usage:
//   node scripts/update-story-feature-complete.mjs <TASK-ID> <verdict>
//   where <verdict> ∈ { verified | pending | regressed }
//
// Exit codes:
//   0 — updated
//   1 — task not found OR invalid verdict
//   2 — IO error / story block lookup failed

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';
import { buildIndex } from '../roadmap/tree-index.mjs';
import { findTaskBlock } from './roadmap-update-task.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const YML = resolve(ROOT, 'roadmap/roadmap.yml');

const VALID_VERDICTS = new Set(['verified', 'pending', 'regressed']);

function nowIsoMinute() {
  return new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:\d{2}Z$/, ':00Z');
}

function findKeyInBlock(lines, block, key) {
  const childIndent = block.baseIndent + 2;
  const re = new RegExp(`^ {${childIndent}}${key}\\s*:\\s*(.*)$`);
  for (let i = block.start; i < block.end; i++) {
    const m = lines[i].match(re);
    if (m) return { idx: i, value: m[1], indent: childIndent };
  }
  return null;
}

// Find a good place to INSERT a new key in the story block. After
// `description:` if present, otherwise after `title:`, otherwise after
// the `- id:` line.
function findInsertIdx(lines, block) {
  const childIndent = block.baseIndent + 2;
  for (const key of ['description', 'title', 'id']) {
    const re = new RegExp(`^ {${childIndent}}${key}\\s*:`);
    let lastMatch = -1;
    for (let i = block.start; i < block.end; i++) {
      if (re.test(lines[i])) lastMatch = i;
    }
    if (lastMatch >= 0) {
      // For a multi-line block scalar (description: |), walk past its lines.
      let j = lastMatch + 1;
      while (j < block.end) {
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
      return j;
    }
  }
  return block.start + 1;
}

function setOrInsertKey(lines, block, key, value) {
  const existing = findKeyInBlock(lines, block, key);
  const childIndent = block.baseIndent + 2;
  const valueStr = value === null ? 'null' : value;
  const newLine = `${' '.repeat(childIndent)}${key}: ${valueStr}`;
  if (existing) {
    lines[existing.idx] = newLine;
    return { mutated: true };
  }
  const insertAt = findInsertIdx(lines, block);
  lines.splice(insertAt, 0, newLine);
  return { mutated: true, inserted: true };
}

function main() {
  const [taskId, verdict] = process.argv.slice(2);
  if (!taskId || !verdict) {
    process.stderr.write('usage: update-story-feature-complete.mjs <TASK-ID> <verdict>\n');
    process.exit(1);
  }
  if (!VALID_VERDICTS.has(verdict)) {
    process.stderr.write(
      `invalid verdict: ${verdict}; must be one of ${[...VALID_VERDICTS].join('|')}\n`,
    );
    process.exit(1);
  }

  let text;
  try {
    text = readFileSync(YML, 'utf8');
  } catch (e) {
    process.stderr.write(`cannot read ${YML}: ${e.message}\n`);
    process.exit(2);
  }

  const roadmap = parse(text);
  const idx = buildIndex(roadmap);
  const storyId = idx.taskToStory.get(taskId);
  if (!storyId) {
    process.stderr.write(`task ${taskId} not found in roadmap\n`);
    process.exit(1);
  }

  const lines = text.split('\n');
  const storyBlock = findTaskBlock(lines, storyId);
  if (!storyBlock) {
    process.stderr.write(`story block ${storyId} not found in line-level lookup\n`);
    process.exit(2);
  }

  setOrInsertKey(lines, storyBlock, 'feature_complete', verdict);
  // Re-find the block in case the prior insert shifted indices, then set
  // verified_at. (The `setOrInsertKey` for feature_complete may have
  // inserted a line, growing the block by 1.)
  const refreshed = findTaskBlock(lines, storyId);
  setOrInsertKey(lines, refreshed, 'verified_at', `'${nowIsoMinute()}'`);

  writeFileSync(YML, lines.join('\n'));
  process.stdout.write(`${storyId} feature_complete=${verdict}\n`);
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main();
