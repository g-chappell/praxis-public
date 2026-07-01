#!/usr/bin/env node
// select-task.mjs — feature-first picker for the autonomous cycle.
//
// Picks the next Task by feature coherence, not just task velocity. Priority
// (top → bottom):
//
//   1. FOLLOW-UP BACKLOG — any eligible Task with followup_of != null.
//      Tasks added mid-cycle (via roadmap-followup.mjs) to plug a stub
//      gap take precedence in the next cycle, before any unrelated work.
//   2. FEATURE AFFINITY — prefer Tasks in the same Story as the most
//      recent in-progress task (or, if none in-progress, the Story
//      containing the most recent AGENT-LOG `success` entry).
//   3. STARVATION GUARD — if a `high`-priority Story has zero done tasks
//      and the active Story is `med`/`low`, switch to the starved Story.
//      Prevents lock-in on a low-priority Story.
//   4. DEFAULT ORDER — within candidates: priority desc, then numeric ID asc.
//
// Eligibility: status=="ready" AND all depends_on done AND attempt_count<3
// AND no open PR with this TASK-id in its branch name.
//
// Inputs:
//   - <project>/roadmap/roadmap.yml
//   - <project>/AGENT-LOG.md (optional; missing = first cycle)
//   - `gh pr list` for open PR exclusion (skippable with --skip-gh)
//
// Output: single line of JSON on stdout.
//   { "taskId": "TASK-042", "storyId": "STORY-07", "reason": "affinity" }
//   { "noTask": true, "reason": "no_ready_tasks" }
//
// reason ∈ { "follow-up", "affinity", "starvation-guard", "default",
//            "no_ready_tasks" }
//
// Args:
//   --print-story <TASK-ID>   print the Story id for that task, exit 0
//   --skip-gh                 don't query gh (tests use this)
//   --root <path>             override project root (tests use this)
//
// Exit codes:
//   0  picked a task or noTask:true with valid JSON
//   1  bad args, missing roadmap, parse error

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';
import { buildIndex } from '../roadmap/tree-index.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SELF_DIR, '..');
const PRIORITY_RANK = { high: 3, med: 2, low: 1 };

// --- Parsing helpers (exported for tests) ---

// Extract the most recent task id from AGENT-LOG by scanning `### Run`
// blocks. The file is append-only and chronological, so the LAST occurrence
// of a `- Task: TASK-NNN` inside a `### Run` block is the freshest.
export function parseAgentLog(text) {
  if (!text) return { lastTaskId: null };
  const lines = text.split('\n');
  let lastTaskId = null;
  let inRun = false;
  for (const line of lines) {
    if (line.startsWith('### Run ')) {
      inRun = true;
      continue;
    }
    if (line.startsWith('### ') && inRun) {
      inRun = false;
      continue;
    }
    if (inRun) {
      const m = line.match(/^-\s+Task:\s+(TASK-\d+)/);
      if (m) lastTaskId = m[1];
    }
  }
  return { lastTaskId };
}

export function collectEligible(roadmap, openPrTaskIds = new Set()) {
  const taskById = new Map();
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      for (const task of story.tasks || []) {
        taskById.set(task.id, task);
      }
    }
  }
  const eligible = [];
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      for (const task of story.tasks || []) {
        if (task.status !== 'ready') continue;
        if ((task.attempt_count || 0) >= 3) continue;
        if (openPrTaskIds.has(task.id)) continue;
        const deps = task.depends_on || [];
        let depsOk = true;
        for (const depId of deps) {
          const dep = taskById.get(depId);
          if (!dep || dep.status !== 'done') {
            depsOk = false;
            break;
          }
        }
        if (!depsOk) continue;
        eligible.push({ task, story, epic });
      }
    }
  }
  return eligible;
}

function compareEligible(a, b) {
  const pa = PRIORITY_RANK[a.task.priority] || 0;
  const pb = PRIORITY_RANK[b.task.priority] || 0;
  if (pa !== pb) return pb - pa;
  const aN = parseInt(a.task.id.replace(/^TASK-/i, ''), 10);
  const bN = parseInt(b.task.id.replace(/^TASK-/i, ''), 10);
  return aN - bN;
}

export function findActiveStory(roadmap, idx, agentLogText) {
  // 1. Any in-progress task wins.
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      for (const task of story.tasks || []) {
        if (task.status === 'in-progress') return story.id;
      }
    }
  }
  // 2. Most recent AGENT-LOG task.
  const { lastTaskId } = parseAgentLog(agentLogText);
  if (lastTaskId && idx.taskToStory.has(lastTaskId)) {
    return idx.taskToStory.get(lastTaskId);
  }
  return null;
}

export function findStarvedHighPriority(roadmap, eligibleStoryIds, activeStoryId) {
  // A story is "starved" if it has high-priority tasks, zero done, has an
  // eligible task, AND is not the active story (and active isn't high-pri).
  if (!activeStoryId) return null;
  let activeIsHigh = false;
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      if (story.id !== activeStoryId) continue;
      activeIsHigh = (story.tasks || []).some((t) => t.priority === 'high');
      break;
    }
    if (activeIsHigh) break;
  }
  if (activeIsHigh) return null;
  for (const epic of roadmap.epics || []) {
    for (const story of epic.stories || []) {
      if (story.id === activeStoryId) continue;
      if (!eligibleStoryIds.has(story.id)) continue;
      const tasks = story.tasks || [];
      const hasHigh = tasks.some((t) => t.priority === 'high');
      const hasDone = tasks.some((t) => t.status === 'done');
      if (hasHigh && !hasDone) return story.id;
    }
  }
  return null;
}

// --- The picker ---

export function selectTask(roadmap, agentLogText, openPrTaskIds = new Set()) {
  const idx = buildIndex(roadmap);
  const eligible = collectEligible(roadmap, openPrTaskIds);
  if (eligible.length === 0) {
    return { noTask: true, reason: 'no_ready_tasks' };
  }

  // 1. Follow-up backlog
  const followups = eligible.filter((e) => e.task.followup_of != null);
  if (followups.length > 0) {
    followups.sort(compareEligible);
    const pick = followups[0];
    return { taskId: pick.task.id, storyId: pick.story.id, reason: 'follow-up' };
  }

  const activeStoryId = findActiveStory(roadmap, idx, agentLogText);
  const eligibleStoryIds = new Set(eligible.map((e) => e.story.id));

  // 2. Starvation guard fires BEFORE plain affinity — it overrides a
  // med/low active story when a high-pri story is starved.
  const starved = findStarvedHighPriority(roadmap, eligibleStoryIds, activeStoryId);
  if (starved) {
    const candidates = eligible.filter((e) => e.story.id === starved);
    candidates.sort(compareEligible);
    const pick = candidates[0];
    return { taskId: pick.task.id, storyId: pick.story.id, reason: 'starvation-guard' };
  }

  // 3. Feature affinity
  if (activeStoryId) {
    const sameStory = eligible.filter((e) => e.story.id === activeStoryId);
    if (sameStory.length > 0) {
      sameStory.sort(compareEligible);
      const pick = sameStory[0];
      return { taskId: pick.task.id, storyId: pick.story.id, reason: 'affinity' };
    }
  }

  // 4. Default order
  const sorted = eligible.slice().sort(compareEligible);
  const pick = sorted[0];
  return { taskId: pick.task.id, storyId: pick.story.id, reason: 'default' };
}

// --- Open-PR detection via gh CLI ---

function fetchOpenPrTaskIds() {
  try {
    const out = execSync('gh pr list --state open --json headRefName --jq ".[].headRefName"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });
    const taskIds = new Set();
    for (const branch of out.trim().split('\n')) {
      const m = branch.match(/(TASK-\d+)/);
      if (m) taskIds.add(m[1]);
    }
    return taskIds;
  } catch {
    // gh failure shouldn't block the cycle — best-effort.
    return new Set();
  }
}

// --- CLI ---

function parseCliArgs(argv) {
  const args = { printStory: null, skipGh: false, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--print-story') {
      args.printStory = argv[++i];
      continue;
    }
    if (a === '--skip-gh') {
      args.skipGh = true;
      continue;
    }
    if (a === '--root') {
      args.root = argv[++i];
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

function main() {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`select-task: ${e.message}\n`);
    process.exit(1);
  }

  const root = args.root ? resolve(args.root) : DEFAULT_ROOT;
  const ymlPath = resolve(root, 'roadmap/roadmap.yml');
  const logPath = resolve(root, 'AGENT-LOG.md');

  let roadmap;
  try {
    roadmap = parse(readFileSync(ymlPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`select-task: cannot parse ${ymlPath}: ${e.message}\n`);
    process.exit(1);
  }
  let agentLog = '';
  try {
    agentLog = readFileSync(logPath, 'utf8');
  } catch {
    /* first cycle — no AGENT-LOG yet */
  }

  if (args.printStory) {
    const idx = buildIndex(roadmap);
    const storyId = idx.taskToStory.get(args.printStory);
    if (!storyId) {
      process.stderr.write(`select-task: ${args.printStory} not found in roadmap\n`);
      process.exit(1);
    }
    process.stdout.write(`${storyId}\n`);
    return;
  }

  const openPrTaskIds = args.skipGh ? new Set() : fetchOpenPrTaskIds();
  const result = selectTask(roadmap, agentLog, openPrTaskIds);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main();
