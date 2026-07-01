// select-task.test.mjs — node --test runner for the picker.
//
// Synthetic roadmap fixtures (small in-memory objects matching the parsed
// shape of roadmap.yml) drive the exported pure functions. The CLI side
// (gh PR fetch, fs reads, JSON stdout) is covered by the integration
// run on the real colonize / pirate-battle roadmaps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTask, parseAgentLog } from './select-task.mjs';
import { buildIndex } from '../roadmap/tree-index.mjs';

// --- Fixture helpers ---

function mkTask(id, overrides = {}) {
  return {
    id,
    title: `task ${id}`,
    status: 'ready',
    priority: 'med',
    complexity: 'small',
    workspaces: [],
    description: null,
    depends_on: [],
    pr: null,
    completed: null,
    blocked_reason: null,
    last_attempted: null,
    attempt_count: 0,
    task_acceptance: null,
    is_terminal: false,
    followup_of: null,
    ...overrides,
  };
}

function mkStory(id, tasks, overrides = {}) {
  return {
    id,
    title: `story ${id}`,
    description: null,
    acceptance_criteria: [],
    user_flow: null,
    out_of_scope: null,
    feature_complete: null,
    verified_at: null,
    tasks,
    ...overrides,
  };
}

function mkEpic(id, stories) {
  return { id, title: `epic ${id}`, description: null, stories };
}

function mkRoadmap(epics) {
  return {
    version: 1,
    meta: { project: 'test', branch_prefix: 'auto/', task_id_format: 'TASK-\\d+' },
    epics,
  };
}

// --- noTask cases ---

test('empty roadmap returns noTask', () => {
  const r = mkRoadmap([]);
  assert.deepEqual(selectTask(r, ''), { noTask: true, reason: 'no_ready_tasks' });
});

test('all tasks done returns noTask', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [mkStory('STORY-01', [mkTask('TASK-001', { status: 'done' })])]),
  ]);
  assert.deepEqual(selectTask(r, ''), { noTask: true, reason: 'no_ready_tasks' });
});

test('attempt_count >= 3 disqualifies', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [mkStory('STORY-01', [mkTask('TASK-001', { attempt_count: 3 })])]),
  ]);
  assert.deepEqual(selectTask(r, ''), { noTask: true, reason: 'no_ready_tasks' });
});

test('depends_on with non-done dep disqualifies', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001', { status: 'ready' }), // dep not done
        mkTask('TASK-002', { depends_on: ['TASK-001'] }), // ineligible
      ]),
    ]),
  ]);
  const result = selectTask(r, '');
  // TASK-001 is eligible; TASK-002 isn't.
  assert.equal(result.taskId, 'TASK-001');
});

test('open PR by task id excludes', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [mkStory('STORY-01', [mkTask('TASK-001'), mkTask('TASK-002')])]),
  ]);
  const result = selectTask(r, '', new Set(['TASK-001']));
  assert.equal(result.taskId, 'TASK-002');
});

// --- Default ordering ---

test('default order: priority desc then numeric id asc', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001', { priority: 'low' }),
        mkTask('TASK-002', { priority: 'high' }),
        mkTask('TASK-003', { priority: 'med' }),
        mkTask('TASK-004', { priority: 'high' }),
      ]),
    ]),
  ]);
  const result = selectTask(r, '');
  assert.equal(result.taskId, 'TASK-002');
  assert.equal(result.reason, 'default');
});

// --- Follow-up backlog ---

test('follow-up beats everything, even higher priority', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001', { priority: 'high' }),
        mkTask('TASK-002', { priority: 'low', followup_of: 'TASK-001' }),
      ]),
    ]),
  ]);
  const result = selectTask(r, '');
  assert.equal(result.taskId, 'TASK-002');
  assert.equal(result.reason, 'follow-up');
});

test('multiple follow-ups: priority + ID order', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-010', { followup_of: 'TASK-001', priority: 'low' }),
        mkTask('TASK-011', { followup_of: 'TASK-001', priority: 'high' }),
        mkTask('TASK-012', { followup_of: 'TASK-001', priority: 'high' }),
      ]),
    ]),
  ]);
  const result = selectTask(r, '');
  assert.equal(result.taskId, 'TASK-011');
  assert.equal(result.reason, 'follow-up');
});

// --- Feature affinity (from AGENT-LOG) ---

test('affinity: med-priority active story keeps eligible (no starvation trigger)', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [mkTask('TASK-001', { priority: 'med' })]),
      mkStory('STORY-02', [
        mkTask('TASK-002', { status: 'done' }),
        mkTask('TASK-003', { priority: 'low' }),
      ]),
    ]),
  ]);
  const log = '### Run [2026-05-27 10:00]\n- Task: TASK-002 — done thing\n';
  const result = selectTask(r, log);
  assert.equal(result.taskId, 'TASK-003');
  assert.equal(result.reason, 'affinity');
});

test('affinity: in-progress task overrides AGENT-LOG signal', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [mkTask('TASK-001', { status: 'in-progress' }), mkTask('TASK-002')]),
      mkStory('STORY-02', [mkTask('TASK-003', { status: 'done' })]),
    ]),
  ]);
  const log = '### Run [2026-05-27]\n- Task: TASK-003 — done thing\n';
  const result = selectTask(r, log);
  // STORY-01 is active (in-progress task wins over AGENT-LOG).
  assert.equal(result.taskId, 'TASK-002');
  assert.equal(result.reason, 'affinity');
});

// --- Starvation guard ---

test('starvation: high-pri story starved while active is med', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001', { priority: 'med', status: 'done' }),
        mkTask('TASK-002', { priority: 'med' }),
      ]),
      mkStory('STORY-02', [
        mkTask('TASK-003', { priority: 'high' }),
        mkTask('TASK-004', { priority: 'high' }),
      ]),
    ]),
  ]);
  const log = '### Run [2026-05-27]\n- Task: TASK-001 — done\n';
  const result = selectTask(r, log);
  // STORY-01 is active (med), STORY-02 has high-pri tasks, zero done →
  // starvation guard switches to STORY-02.
  assert.equal(result.taskId, 'TASK-003');
  assert.equal(result.reason, 'starvation-guard');
});

test('no starvation: active story is itself high-pri', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001', { priority: 'high', status: 'done' }),
        mkTask('TASK-002', { priority: 'high' }),
      ]),
      mkStory('STORY-02', [mkTask('TASK-003', { priority: 'high' })]),
    ]),
  ]);
  const log = '### Run [2026-05-27]\n- Task: TASK-001 — done\n';
  const result = selectTask(r, log);
  // Active STORY-01 is high-pri → no switch. Affinity picks TASK-002.
  assert.equal(result.taskId, 'TASK-002');
  assert.equal(result.reason, 'affinity');
});

test('no starvation: high-pri story has done tasks (already started)', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [mkTask('TASK-001', { priority: 'med' })]),
      mkStory('STORY-02', [
        mkTask('TASK-002', { priority: 'high', status: 'done' }),
        mkTask('TASK-003', { priority: 'high' }),
      ]),
    ]),
  ]);
  const log = '### Run [2026-05-27]\n- Task: TASK-some-old — done\n';
  // No active story (the AGENT-LOG task isn't in the roadmap).
  const result = selectTask(r, log);
  // STORY-02 has done already, so it's not starved. Default ordering picks
  // TASK-003 (high > med beats TASK-001).
  assert.equal(result.taskId, 'TASK-003');
  assert.equal(result.reason, 'default');
});

// --- parseAgentLog ---

test('parseAgentLog finds the most recent Run task', () => {
  const log = [
    '### Run [2026-05-27 09:00]',
    '- Task: TASK-001 — first',
    '- Outcome: success',
    '',
    '---',
    '### Run [2026-05-27 10:00]',
    '- Task: TASK-002 — second',
    '- Outcome: success',
  ].join('\n');
  assert.deepEqual(parseAgentLog(log), { lastTaskId: 'TASK-002' });
});

test('parseAgentLog skips non-Run headings', () => {
  const log = [
    '### Run [2026-05-27 09:00]',
    '- Task: TASK-001 — picked',
    '',
    '### Strategic Reset [2026-05-27 10:00]',
    '- Task: TASK-ignored — meta event',
    '',
    '### Run [2026-05-27 11:00]',
    '- Task: TASK-003 — latest',
  ].join('\n');
  assert.deepEqual(parseAgentLog(log), { lastTaskId: 'TASK-003' });
});

test('parseAgentLog empty input', () => {
  assert.deepEqual(parseAgentLog(''), { lastTaskId: null });
  assert.deepEqual(parseAgentLog(undefined), { lastTaskId: null });
});

// --- buildIndex sanity (small) ---

test('buildIndex maps task → story, terminals = topological leaves when unset', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001'),
        mkTask('TASK-002', { depends_on: ['TASK-001'] }),
        mkTask('TASK-003', { depends_on: ['TASK-002'] }),
      ]),
    ]),
  ]);
  const idx = buildIndex(r);
  assert.equal(idx.taskToStory.get('TASK-001'), 'STORY-01');
  assert.equal(idx.taskToStory.get('TASK-003'), 'STORY-01');
  const terms = idx.storyTerminals.get('STORY-01');
  assert.equal(terms.size, 1);
  assert.ok(terms.has('TASK-003'));
});

test('buildIndex respects explicit is_terminal', () => {
  const r = mkRoadmap([
    mkEpic('EPIC-01', [
      mkStory('STORY-01', [
        mkTask('TASK-001', { is_terminal: true }),
        mkTask('TASK-002', { depends_on: ['TASK-001'] }),
      ]),
    ]),
  ]);
  const idx = buildIndex(r);
  // Explicit is_terminal wins, even though TASK-002 is the topological leaf.
  const terms = idx.storyTerminals.get('STORY-01');
  assert.equal(terms.size, 1);
  assert.ok(terms.has('TASK-001'));
});
