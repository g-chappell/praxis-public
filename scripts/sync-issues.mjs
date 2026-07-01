#!/usr/bin/env node
// scripts/sync-issues.mjs — sync roadmap/roadmap.yml to GitHub issues + sub-issues + project board.
//
// Idempotent: each EPIC/STORY/TASK becomes an issue keyed by its roadmap ID
// (matched via the leading "ID:" in the title). Re-running updates bodies,
// links sub-issues, and ensures every issue is on the configured project.
//
// roadmap.yml is the canonical source; this script never reads from GitHub
// to mutate the roadmap.
//
// State is reconciled too: an issue whose roadmap item is complete (a TASK
// with status: done, a STORY with feature_complete: verified or all tasks
// done, an EPIC with all stories complete) is closed as completed. This is
// the canonical way Story/Task issues get closed — do NOT rely on a PR's
// "Closes #N" (the agent writes roadmap IDs, not issue numbers). Closing is
// one-directional; completed→reopened regressions are handled manually.
//
// Usage:
//   node scripts/sync-issues.mjs           # apply changes
//   node scripts/sync-issues.mjs --dry-run # log what would happen
//   node scripts/sync-issues.mjs --no-project   # skip project board step
//   node scripts/sync-issues.mjs --no-subissues # skip sub-issue linking step
//   node scripts/sync-issues.mjs --no-close     # skip closing completed issues

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const REPO = 'g-chappell/praxis';
const PROJECT_OWNER = 'g-chappell';
const PROJECT_NUMBER = 3;

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PROJECT = process.argv.includes('--no-project');
const SKIP_SUBISSUES = process.argv.includes('--no-subissues');
const SKIP_CLOSE = process.argv.includes('--no-close');

function sh(cmd, { write = false } = {}) {
  if (DRY_RUN && write) {
    log(`  [dry-run] ${cmd.replace(/\n/g, ' ').slice(0, 200)}`);
    return '';
  }
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

function ghJson(cmd) {
  return JSON.parse(sh(cmd));
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

function escapeForShellSingleQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ----- load roadmap -----
const yamlSrc = readFileSync(join(PROJECT_ROOT, 'roadmap/roadmap.yml'), 'utf8');
const roadmap = parse(yamlSrc);
const epics = roadmap.epics ?? [];
log(`Loaded roadmap: ${epics.length} epics`);

// Completion helpers — shared by the board-Status seed (Pass D) and the
// close pass (Pass E).
const isTaskComplete = (task) => task.status === 'done';
const isStoryComplete = (story) =>
  story.feature_complete === 'verified' ||
  (Array.isArray(story.tasks) && story.tasks.length > 0 && story.tasks.every(isTaskComplete));
const isEpicComplete = (epic) =>
  Array.isArray(epic.stories) && epic.stories.length > 0 && epic.stories.every(isStoryComplete);

// Roadmap ids that are complete — used to seed the right board Status (Done vs
// Backlog) for items that don't yet have a Status set.
const completedIds = new Set();
for (const epic of epics) {
  for (const story of epic.stories ?? []) {
    for (const task of story.tasks ?? []) if (isTaskComplete(task)) completedIds.add(task.id);
    if (isStoryComplete(story)) completedIds.add(story.id);
  }
  if (isEpicComplete(epic)) completedIds.add(epic.id);
}

// ----- discover existing issues -----
log('Fetching existing repo issues…');
const existingIssues = ghJson(
  `gh issue list --repo ${REPO} --state all --limit 1000 --json number,title,labels,milestone,body,state`,
).map((i) => ({
  ...i,
  labelNames: (i.labels || []).map((l) => l.name).sort(),
  milestoneTitle: i.milestone?.title ?? null,
  state: (i.state || 'OPEN').toUpperCase(),
}));

const idRe = /^(EPIC-\d+|STORY-\d+|TASK-\d+):/;
const issueByRoadmapId = new Map();
for (const issue of existingIssues) {
  const m = issue.title.match(idRe);
  if (m) issueByRoadmapId.set(m[1], issue);
}
log(`  ${existingIssues.length} issues found; ${issueByRoadmapId.size} mapped by roadmap ID.`);

// ----- discover milestones -----
log('Fetching milestones…');
const milestones = ghJson(`gh api 'repos/${REPO}/milestones?state=all&per_page=100'`);
const milestoneByEpic = new Map();
for (const m of milestones) {
  const match = m.title.match(/^(EPIC-\d+):/);
  if (match) milestoneByEpic.set(match[1], { number: m.number, title: m.title });
}
log(`  ${milestoneByEpic.size} epic milestones found.`);

// ----- render bodies -----
function refMd(id, idToNum) {
  const n = idToNum.get(id);
  return n ? `[\`${id}\`](https://github.com/${REPO}/issues/${n}) (#${n})` : `\`${id}\``;
}

function renderEpicBody(epic, idToNum) {
  const stories = epic.stories.map((s) => `- ${refMd(s.id, idToNum)} — ${s.title}`).join('\n');
  return `**Epic** \`${epic.id}\` mirrors \`roadmap/roadmap.yml\`. Milestone: \`${epic.id}: ${epic.title}\`.

${(epic.description || '').trim()}

## Stories
${stories}

---
*Synced from \`roadmap/roadmap.yml\` by \`scripts/sync-issues.mjs\`. Edit the YAML and re-run the script.*
`;
}

function renderStoryBody(story, epic, idToNum) {
  const ac = (story.acceptance_criteria || []).map((a) => `- ${a}`).join('\n');
  const flow = (story.user_flow || []).map((s) => `1. ${s}`).join('\n');
  const oos = (story.out_of_scope || []).map((s) => `- ${s}`).join('\n');
  const tasks = story.tasks.map((t) => `- ${refMd(t.id, idToNum)} — ${t.title}`).join('\n');
  return `**Story** \`${story.id}\` mirrors \`roadmap/roadmap.yml\`. Parent epic: ${refMd(epic.id, idToNum)}.

${(story.description || '').trim()}

## Acceptance criteria
${ac || '_None recorded yet._'}

${flow ? `## User flow\n${flow}\n\n` : ''}${oos ? `## Out of scope\n${oos}\n\n` : ''}## Tasks
${tasks}

---
*Synced from \`roadmap/roadmap.yml\` by \`scripts/sync-issues.mjs\`.*
`;
}

function renderTaskBody(task, story, epic, idToNum) {
  // Defensive: yaml-lite only parses single-line flow arrays; a malformed field
  // (e.g. a multi-line `workspaces:`) parses as a non-array. Coerce so one bad
  // task can't crash the whole issue sync (the data fix is single-line arrays).
  const arr = (v) => (Array.isArray(v) ? v : []);
  const ac = arr(task.task_acceptance)
    .map((a) => `- ${a}`)
    .join('\n');
  const deps = arr(task.depends_on)
    .map((d) => `- ${refMd(d, idToNum)}`)
    .join('\n');
  const ws = arr(task.workspaces)
    .map((w) => `\`${w}\``)
    .join(', ');
  return `**Task** \`${task.id}\` mirrors \`roadmap/roadmap.yml\`. Parent story: ${refMd(story.id, idToNum)}. Epic: ${refMd(epic.id, idToNum)}.

${(task.description || '').trim()}

## Task acceptance
${ac || '_None recorded yet._'}

## Meta
- **Status:** \`${task.status}\`
- **Priority:** \`${task.priority}\`
- **Complexity:** \`${task.complexity}\`
- **Terminal:** ${task.is_terminal ? "yes — completing this satisfies the parent story's AC" : 'no'}
- **Workspaces:** ${ws || '_none_'}

${deps ? `## Depends on\n${deps}\n` : ''}
---
*Synced from \`roadmap/roadmap.yml\` by \`scripts/sync-issues.mjs\`.*
`;
}

// ----- ensure issue exists -----
function ensureIssue({ id, title, labels, milestone }) {
  const existing = issueByRoadmapId.get(id);
  if (existing) {
    log(`  exists: ${id} → #${existing.number}`);
    return existing.number;
  }
  const labelArgs = labels.map((l) => `--label ${escapeForShellSingleQuote(l)}`).join(' ');
  const milestoneArg = milestone ? `--milestone ${escapeForShellSingleQuote(milestone.title)}` : '';
  // Create with a stub body; we'll fill in the real body in pass B once IDs are known.
  const cmd = `gh issue create --repo ${REPO} --title ${escapeForShellSingleQuote(title)} --body ${escapeForShellSingleQuote(`(syncing from roadmap.yml — body will be filled by sync-issues.mjs)`)} ${labelArgs} ${milestoneArg}`;
  const url = sh(cmd, { write: true });
  if (DRY_RUN) return -1; // placeholder
  const num = parseInt(url.split('/').pop(), 10);
  log(`  created: ${id} → #${num} (${url})`);
  // Add it to the in-memory map so the second pass can reference it
  issueByRoadmapId.set(id, {
    number: num,
    title,
    labels: labels.map((name) => ({ name })),
    labelNames: [...labels].sort(),
    milestone: milestone ? { title: milestone.title } : null,
    milestoneTitle: milestone?.title ?? null,
    body: '',
    state: 'OPEN',
  });
  return num;
}

function reconcileMeta({ id, title, labels, milestone }) {
  const existing = issueByRoadmapId.get(id);
  if (!existing) return; // created earlier in this run; no reconcile needed
  const num = existing.number;
  if (num < 0) return; // dry-run placeholder

  const wantedLabels = [...labels].sort();
  const labelsChanged =
    wantedLabels.length !== existing.labelNames.length ||
    wantedLabels.some((l, i) => l !== existing.labelNames[i]);
  const titleChanged = existing.title !== title;
  const wantedMs = milestone?.title ?? null;
  const milestoneChanged = existing.milestoneTitle !== wantedMs;

  if (!titleChanged && !labelsChanged && !milestoneChanged) return;

  const parts = [`gh issue edit ${num} --repo ${REPO}`];
  if (titleChanged) parts.push(`--title ${escapeForShellSingleQuote(title)}`);
  if (milestoneChanged) {
    parts.push(
      wantedMs ? `--milestone ${escapeForShellSingleQuote(wantedMs)}` : `--remove-milestone`,
    );
  }
  if (labelsChanged) {
    // remove every label that exists but isn't wanted, add every wanted that's missing
    for (const old of existing.labelNames) {
      if (!wantedLabels.includes(old))
        parts.push(`--remove-label ${escapeForShellSingleQuote(old)}`);
    }
    for (const w of wantedLabels) {
      if (!existing.labelNames.includes(w))
        parts.push(`--add-label ${escapeForShellSingleQuote(w)}`);
    }
  }
  sh(parts.join(' '), { write: true });
  const changedBits = [
    titleChanged && 'title',
    labelsChanged && 'labels',
    milestoneChanged && 'milestone',
  ]
    .filter(Boolean)
    .join('+');
  log(`  reconciled: ${id} (#${num}) — ${changedBits}`);
  // Reflect the change in the cache so subsequent passes see fresh values
  existing.title = title;
  existing.labelNames = wantedLabels;
  existing.labels = labels.map((name) => ({ name }));
  existing.milestoneTitle = wantedMs;
  existing.milestone = milestone ? { title: milestone.title } : null;
}

// ----- Pass A: ensure every epic/story/task has an issue -----
log('\n=== Pass A: ensure issues exist ===');
const idToNum = new Map();

for (const epic of epics) {
  const milestone = milestoneByEpic.get(epic.id);
  const spec = {
    id: epic.id,
    title: `${epic.id}: ${epic.title}`,
    labels: ['type:epic'],
    milestone,
  };
  const num = ensureIssue(spec);
  reconcileMeta(spec);
  idToNum.set(epic.id, num);
}

for (const epic of epics) {
  const milestone = milestoneByEpic.get(epic.id);
  for (const story of epic.stories) {
    const spec = {
      id: story.id,
      title: `${story.id}: ${story.title}`,
      labels: ['type:story'],
      milestone,
    };
    const num = ensureIssue(spec);
    reconcileMeta(spec);
    idToNum.set(story.id, num);
  }
}

for (const epic of epics) {
  const milestone = milestoneByEpic.get(epic.id);
  for (const story of epic.stories) {
    for (const task of story.tasks) {
      const labels = ['type:task', `priority:${task.priority}`, `complexity:${task.complexity}`];
      if (task.is_terminal) labels.push('is-terminal');
      const spec = {
        id: task.id,
        title: `${task.id}: ${task.title}`,
        labels,
        milestone,
      };
      const num = ensureIssue(spec);
      reconcileMeta(spec);
      idToNum.set(task.id, num);
    }
  }
}

// ----- Pass B: update bodies with cross-references -----
log('\n=== Pass B: update issue bodies ===');

function updateBody(id, body) {
  const num = idToNum.get(id);
  if (!num || num < 0) return;
  const existing = issueByRoadmapId.get(id);
  if (existing && existing.body === body) {
    log(`  unchanged: ${id} (#${num})`);
    return;
  }
  const cmd = `gh issue edit ${num} --repo ${REPO} --body ${escapeForShellSingleQuote(body)}`;
  sh(cmd, { write: true });
  log(`  updated:   ${id} (#${num})`);
}

for (const epic of epics) {
  updateBody(epic.id, renderEpicBody(epic, idToNum));
}
for (const epic of epics) {
  for (const story of epic.stories) {
    updateBody(story.id, renderStoryBody(story, epic, idToNum));
  }
}
for (const epic of epics) {
  for (const story of epic.stories) {
    for (const task of story.tasks) {
      updateBody(task.id, renderTaskBody(task, story, epic, idToNum));
    }
  }
}

// ----- Pass C: link sub-issues via GraphQL -----
if (!SKIP_SUBISSUES) {
  log('\n=== Pass C: link sub-issues ===');

  // We need GitHub node IDs (not numbers) for the addSubIssue mutation.
  const nodeIdCache = new Map();
  function nodeId(num) {
    if (nodeIdCache.has(num)) return nodeIdCache.get(num);
    const q = `repository(owner:"${PROJECT_OWNER}",name:"praxis"){issue(number:${num}){id}}`;
    const out = sh(
      `gh api graphql -f query=${escapeForShellSingleQuote(`{${q}}`)} --jq .data.repository.issue.id`,
    );
    nodeIdCache.set(num, out);
    return out;
  }

  // The child's current parent issue number, or null if it has none. GitHub
  // allows a sub-issue only one parent, so we read this before linking to decide
  // between a fresh link and a re-parent.
  function currentParentNum(childNum) {
    const q = `repository(owner:"${PROJECT_OWNER}",name:"praxis"){issue(number:${childNum}){parent{number}}}`;
    const out = sh(
      `gh api graphql -f query=${escapeForShellSingleQuote(`{${q}}`)} --jq '.data.repository.issue.parent.number // empty'`,
    );
    return out ? Number(out) : null;
  }

  function linkSubIssue(parentNum, childNum) {
    if (parentNum < 0 || childNum < 0) return; // dry-run placeholders
    const existing = currentParentNum(childNum);
    if (existing === parentNum) return; // already correctly parented — no-op

    const parentId = nodeId(parentNum);
    const childId = nodeId(childNum);
    const add = `mutation { addSubIssue(input: { issueId: "${parentId}", subIssueId: "${childId}" }) { issue { number } subIssue { number } } }`;
    try {
      if (existing != null) {
        // Re-parent: a task moved between stories in the roadmap but its issue is
        // still linked under the old parent. GitHub rejects a second parent, so
        // detach from the stale one first, then attach to the new one.
        const remove = `mutation { removeSubIssue(input: { issueId: "${nodeId(existing)}", subIssueId: "${childId}" }) { issue { number } } }`;
        sh(`gh api graphql -f query=${escapeForShellSingleQuote(remove)}`, { write: true });
        sh(`gh api graphql -f query=${escapeForShellSingleQuote(add)}`, { write: true });
        log(`  re-parented: #${childNum} → #${parentNum} (was #${existing})`);
      } else {
        sh(`gh api graphql -f query=${escapeForShellSingleQuote(add)}`, { write: true });
        log(`  linked: #${childNum} → parent #${parentNum}`);
      }
    } catch {
      // Sub-issues not enabled, or the API rejected it. Surface and continue.
      log(`  skip:   #${childNum} → #${parentNum} (API rejected)`);
    }
  }

  for (const epic of epics) {
    const epicNum = idToNum.get(epic.id);
    for (const story of epic.stories) {
      const storyNum = idToNum.get(story.id);
      linkSubIssue(epicNum, storyNum);
      for (const task of story.tasks) {
        const taskNum = idToNum.get(task.id);
        linkSubIssue(storyNum, taskNum);
      }
    }
  }
}

// ----- Pass D: ensure each issue is on the project board with a Status -----
// New items land with "No Status" unless we set one. We seed the Status field
// (Done if the roadmap item is complete, else Backlog) for items that have no
// Status yet — both freshly added items and any existing "No Status" rows —
// without clobbering a human's manual move (In progress / In review / etc.).
if (!SKIP_PROJECT) {
  log('\n=== Pass D: add issues to project board + seed Status ===');

  // Discover the board's node id + Status field + option ids once (don't
  // hardcode — they're project-specific). Degrade gracefully if unavailable.
  let projectNodeId = null;
  let statusFieldId = null;
  const optionId = {}; // option name -> id
  try {
    projectNodeId = ghJson(
      `gh project view ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --format json`,
    ).id;
    const fields =
      ghJson(`gh project field-list ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --format json`)
        .fields ?? [];
    const status = fields.find((f) => f.name === 'Status' && Array.isArray(f.options));
    if (status) {
      statusFieldId = status.id;
      for (const o of status.options) optionId[o.name] = o.id;
    }
  } catch (err) {
    log(`  ⚠ could not read project metadata — adding items without Status (${err.message})`);
  }
  const canSetStatus = Boolean(projectNodeId && statusFieldId && optionId.Backlog);
  if (projectNodeId && !canSetStatus) {
    log('  ⚠ Status field / Backlog option not found — items added without a Status');
  }

  // Existing board items indexed by content url (capture item id + current status).
  const items = ghJson(
    `gh project item-list ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --format json --limit 1000`,
  );
  const itemByUrl = new Map();
  for (const it of items.items ?? []) {
    if (it?.content?.url) itemByUrl.set(it.content.url, { id: it.id, status: it.status ?? '' });
  }
  log(`  ${itemByUrl.size} items already on board.`);

  function seedStatus(itemId, id) {
    if (!canSetStatus || !itemId) return;
    const want = completedIds.has(id) ? 'Done' : 'Backlog';
    const optId = optionId[want] ?? optionId.Backlog;
    sh(
      `gh project item-edit --id ${itemId} --field-id ${statusFieldId} ` +
        `--single-select-option-id ${optId} --project-id ${projectNodeId}`,
      { write: true },
    );
    log(`  status: ${id} → ${want}`);
  }

  for (const [id, num] of idToNum) {
    if (num < 0) continue;
    const url = `https://github.com/${REPO}/issues/${num}`;
    const existing = itemByUrl.get(url);
    if (!existing) {
      const added = DRY_RUN
        ? { id: null }
        : ghJson(
            `gh project item-add ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --url ${url} --format json`,
          );
      log(`  added: ${id} (#${num}) → board`);
      seedStatus(added?.id, id);
    } else if (!existing.status) {
      // On the board but "No Status" — seed without overwriting a manual status.
      seedStatus(existing.id, id);
    } else if (completedIds.has(id) && existing.status !== 'Done') {
      // Completed but stuck at a stale status (e.g. Backlog seeded while the item
      // was still open) — promote to Done. Mirrors Pass E closing the issue; an
      // incomplete item's manual in-progress status is still left untouched.
      seedStatus(existing.id, id);
    }
  }
}

// ----- Pass E: reconcile open/closed state from roadmap completion -----
if (!SKIP_CLOSE) {
  log('\n=== Pass E: close completed issues ===');

  let closed = 0;
  function closeIfComplete(id, complete) {
    if (!complete) return;
    const num = idToNum.get(id);
    if (!num || num < 0) return;
    const existing = issueByRoadmapId.get(id);
    if (existing?.state === 'CLOSED') return; // already closed — idempotent
    sh(`gh issue close ${num} --repo ${REPO} --reason completed`, { write: true });
    if (existing) existing.state = 'CLOSED';
    closed += 1;
    log(`  closed: ${id} (#${num})`);
  }

  for (const epic of epics) {
    for (const story of epic.stories) {
      for (const task of story.tasks) closeIfComplete(task.id, isTaskComplete(task));
      closeIfComplete(story.id, isStoryComplete(story));
    }
    closeIfComplete(epic.id, isEpicComplete(epic));
  }
  log(`  ${closed} issue(s) ${DRY_RUN ? 'would be ' : ''}closed.`);
}

log('\nDone.');
