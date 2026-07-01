#!/usr/bin/env node
// validate.mjs — schema + referential integrity checks on roadmap.yml
//
// Exits 0 if valid (warnings allowed). Prints errors and exits 1 on hard
// failures. Warnings go to stderr and never affect exit code.
//
// Checks (errors — exit 1):
//   1. Schema (structure, required fields, enum values, regex patterns)
//   2. Uniqueness of IDs across the entire tree
//   3. depends_on references exist and don't form a cycle
//   4. Status transitions: a done task cannot depend on a non-done task
//   5. Branch-name derivability: every task can produce a kebab-case slug
//   6. followup_of references an existing TASK-id
//   7. feature_complete is one of pending|verified|regressed|null
//
// Checks (warnings — stderr only):
//   - Story has no acceptance_criteria (or empty)
//   - Story with multiple terminal tasks (information; not an error)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './yaml-lite.mjs';
import { buildIndex } from './tree-index.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const YML_PATH = resolve(SELF_DIR, 'roadmap.yml');

const errors = [];
const warnings = [];

function err(where, msg) { errors.push(`${where}: ${msg}`); }
function warn(where, msg) { warnings.push(`${where}: ${msg}`); }

function checkSchema(data) {
  if (typeof data !== 'object' || data === null) {
    err('root', 'not an object');
    return;
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    err('root', '`version` must be integer ≥ 1');
  }
  if (!data.meta || typeof data.meta !== 'object') {
    err('root', '`meta` missing or not an object');
    return;
  }
  const meta = data.meta;
  if (!meta.project || typeof meta.project !== 'string') err('meta', '`project` required');
  if (!meta.branch_prefix || typeof meta.branch_prefix !== 'string') err('meta', '`branch_prefix` required');
  if (!meta.task_id_format || typeof meta.task_id_format !== 'string') err('meta', '`task_id_format` required');
  if (!Array.isArray(data.epics)) {
    err('root', '`epics` must be an array');
    return;
  }
  const validStatus = new Set(['ready', 'in-progress', 'done', 'blocked']);
  const validPriority = new Set(['high', 'med', 'low']);
  const validComplexity = new Set(['small', 'medium', 'large']);
  const validFeatureComplete = new Set(['pending', 'verified', 'regressed']);

  for (const [ei, epic] of data.epics.entries()) {
    const ew = `epics[${ei}]`;
    if (!epic.id || !/^EPIC-[0-9A-Z-]+$/i.test(epic.id)) err(ew, `id must match /^EPIC-[0-9A-Z-]+$/`);
    if (!epic.title) err(ew, `title required`);
    const stories = epic.stories || [];
    if (!Array.isArray(stories)) { err(ew, `stories must be array`); continue; }
    for (const [si, story] of stories.entries()) {
      const sw = `${ew}.stories[${si}]`;
      if (!story.id || !/^STORY-[0-9A-Z-]+$/i.test(story.id)) err(sw, `id must match /^STORY-[0-9A-Z-]+$/`);
      if (!story.title) err(sw, `title required`);

      // New optional Story fields
      if (story.acceptance_criteria != null) {
        if (!Array.isArray(story.acceptance_criteria)) {
          err(sw, '`acceptance_criteria` must be an array of strings');
        } else {
          for (const [ai, ac] of story.acceptance_criteria.entries()) {
            if (typeof ac !== 'string' || ac.length === 0) {
              err(sw, `acceptance_criteria[${ai}] must be a non-empty string`);
            }
          }
        }
      }
      if (story.user_flow != null && !Array.isArray(story.user_flow)) {
        err(sw, '`user_flow` must be an array of strings or null');
      }
      if (story.out_of_scope != null && !Array.isArray(story.out_of_scope)) {
        err(sw, '`out_of_scope` must be an array of strings or null');
      }
      if (story.feature_complete != null && !validFeatureComplete.has(story.feature_complete)) {
        err(sw, `feature_complete must be one of ${[...validFeatureComplete].join('|')} or null`);
      }
      if (!story.acceptance_criteria || story.acceptance_criteria.length === 0) {
        warn(sw, `${story.id} has no acceptance_criteria — Step 8.5 will skip the acceptance check (feature_complete = pending)`);
      }

      const tasks = story.tasks || [];
      if (!Array.isArray(tasks)) { err(sw, `tasks must be array`); continue; }
      for (const [ti, task] of tasks.entries()) {
        const tw = `${sw}.tasks[${ti}]`;
        if (!task.id || !/^TASK-[0-9]+$/i.test(task.id)) err(tw, `id must match /^TASK-[0-9]+$/`);
        if (!task.title) err(tw, `title required`);
        if (!task.status || !validStatus.has(task.status)) err(tw, `status must be one of ${[...validStatus].join('|')}`);
        if (!task.priority || !validPriority.has(task.priority)) err(tw, `priority must be one of ${[...validPriority].join('|')}`);
        if (!task.complexity || !validComplexity.has(task.complexity)) err(tw, `complexity must be one of ${[...validComplexity].join('|')}`);

        // New optional Task fields
        if (task.task_acceptance != null) {
          if (!Array.isArray(task.task_acceptance)) {
            err(tw, '`task_acceptance` must be an array of strings or null');
          } else {
            for (const [ai, ac] of task.task_acceptance.entries()) {
              if (typeof ac !== 'string' || ac.length === 0) {
                err(tw, `task_acceptance[${ai}] must be a non-empty string`);
              }
            }
          }
        }
        if (task.is_terminal != null && typeof task.is_terminal !== 'boolean') {
          err(tw, '`is_terminal` must be a boolean');
        }
        if (task.followup_of != null) {
          if (typeof task.followup_of !== 'string' || !/^TASK-[0-9]+$/i.test(task.followup_of)) {
            err(tw, '`followup_of` must be a TASK-id string or null');
          }
        }
      }
    }
  }
}

function walkTasks(data, fn) {
  for (const epic of data.epics || []) {
    for (const story of epic.stories || []) {
      for (const task of story.tasks || []) {
        fn(task, story, epic);
      }
    }
  }
}

function checkUniqueness(data) {
  const ids = new Set();
  for (const epic of data.epics || []) {
    if (epic.id && ids.has(epic.id)) err(epic.id, 'duplicate id');
    if (epic.id) ids.add(epic.id);
    for (const story of epic.stories || []) {
      if (story.id && ids.has(story.id)) err(story.id, 'duplicate id');
      if (story.id) ids.add(story.id);
      for (const task of story.tasks || []) {
        if (task.id && ids.has(task.id)) err(task.id, 'duplicate id');
        if (task.id) ids.add(task.id);
      }
    }
  }
}

function checkDependencies(data) {
  const tasksById = new Map();
  walkTasks(data, (t) => { if (t.id) tasksById.set(t.id, t); });
  walkTasks(data, (task) => {
    const deps = task.depends_on || [];
    for (const depId of deps) {
      if (!tasksById.has(depId)) {
        err(task.id, `depends_on unknown task: ${depId}`);
        continue;
      }
      const dep = tasksById.get(depId);
      if (task.status === 'done' && dep.status !== 'done') {
        err(task.id, `is done but depends_on ${depId} which is not done`);
      }
    }
    // followup_of must reference a real task (and not the task itself)
    if (task.followup_of) {
      if (!tasksById.has(task.followup_of)) {
        err(task.id, `followup_of references unknown task: ${task.followup_of}`);
      } else if (task.followup_of === task.id) {
        err(task.id, `followup_of cannot reference itself`);
      }
    }
  });
  // cycle detection via DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of tasksById.keys()) color.set(id, WHITE);
  function dfs(id, path) {
    if (color.get(id) === GRAY) {
      err('dependency-cycle', [...path, id].join(' -> '));
      return;
    }
    if (color.get(id) === BLACK) return;
    color.set(id, GRAY);
    const t = tasksById.get(id);
    for (const d of t.depends_on || []) dfs(d, [...path, id]);
    color.set(id, BLACK);
  }
  for (const id of tasksById.keys()) dfs(id, []);
}

function kebab(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function checkBranchNames(data) {
  walkTasks(data, (task) => {
    if (!task.title) return;
    const slug = kebab(task.title);
    if (!slug) err(task.id, `title "${task.title}" produces empty slug`);
    if (slug.length > 80) err(task.id, `title produces slug > 80 chars (${slug.length})`);
  });
}

function reportTerminalMultiplicity(data) {
  // Informational only: build the index and warn for stories with >1 terminal.
  const idx = buildIndex(data);
  for (const [storyId, terminals] of idx.storyTerminals.entries()) {
    if (terminals.size > 1) {
      warn(storyId, `multiple terminal tasks (${[...terminals].join(', ')}) — Step 8.5 will fire only when ALL are done`);
    }
  }
}

function main() {
  let src;
  try { src = readFileSync(YML_PATH, 'utf8'); }
  catch (e) { console.error(`cannot read ${YML_PATH}: ${e.message}`); process.exit(1); }
  let data;
  try { data = parse(src); }
  catch (e) { console.error(`yaml parse error: ${e.message}`); process.exit(1); }

  checkSchema(data);
  if (errors.length === 0) {
    checkUniqueness(data);
    checkDependencies(data);
    checkBranchNames(data);
    reportTerminalMultiplicity(data);
  }

  if (warnings.length > 0) {
    for (const w of warnings) console.error(`  ⚠ ${w}`);
  }

  if (errors.length > 0) {
    console.error('roadmap.yml validation FAILED:');
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`roadmap.yml valid.${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}`);
}

main();
