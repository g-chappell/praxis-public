#!/usr/bin/env node
// story-remaining.mjs — print the count of non-done tasks in a Story,
// optionally excluding one Task. Used by autonomous-run Step 8.5 to
// decide whether the just-completed Task closes its Story.
//
// Usage:
//   node scripts/story-remaining.mjs <STORY-ID> [<EXCLUDE-TASK-ID>]
//
// Output: one integer on stdout (the remaining count).
// Exit codes:
//   0  printed
//   1  bad args or i/o error
//   2  story not found

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';
import { storyRemaining, findStory } from '../roadmap/tree-index.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const YML = resolve(ROOT, 'roadmap/roadmap.yml');

function main() {
  const [storyId, excludeTaskId] = process.argv.slice(2);
  if (!storyId) {
    process.stderr.write('story-remaining: STORY-id required\n');
    process.exit(1);
  }
  let roadmap;
  try {
    roadmap = parse(readFileSync(YML, 'utf8'));
  } catch (e) {
    process.stderr.write(`story-remaining: cannot parse ${YML}: ${e.message}\n`);
    process.exit(1);
  }
  if (!findStory(roadmap, storyId)) {
    process.stderr.write(`story-remaining: ${storyId} not found\n`);
    process.exit(2);
  }
  const remaining = storyRemaining(roadmap, storyId, excludeTaskId || null);
  process.stdout.write(`${remaining}\n`);
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main();
