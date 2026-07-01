// Unit tests for POST /sessions room reuse (STORY-32 / TASK-085). Node-compatible:
// Docker, the DB, preview, and templates are mocked, but the *real* in-memory
// runtime (createRoom / getRoomByProject / mintTicket) runs — so this verifies
// that a second user joining a live project attaches to the same session instead
// of booting a parallel sandbox / inserting a second session row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { startSpy, exposeSpy, spawnSpy, insertSpy, state } = vi.hoisted(() => ({
  startSpy: vi.fn(async (projectId: string) => ({ projectId, containerId: `c-${projectId}` })),
  exposeSpy: vi.fn(async () => 'http://10.0.0.5:5173'),
  spawnSpy: vi.fn(async () => ({ pid: 1 })),
  insertSpy: vi.fn(),
  state: { insertCount: 0, projectRow: null as Record<string, unknown> | null },
}));

vi.mock('../src/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/runtime')>();
  return {
    ...actual,
    getSandbox: () => ({ start: startSpy, exposePort: exposeSpy, spawn: spawnSpy }),
  };
});

vi.mock('../src/preview', () => ({
  registerPreview: vi.fn(),
  previewUrlFor: (slug: string) => `https://${slug}.preview.test`,
}));

vi.mock('../src/templates', () => ({
  readTemplateConfig: () => ({ previewPort: 5173, setup: '', dev: '', mcpServers: [] }),
}));

vi.mock('@praxis/db', () => ({
  projects: { id: 'id', templateId: 'templateId' },
  sessions: { id: 'id' },
}));

vi.mock('@praxis/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [state.projectRow ?? { templateId: 'react-threejs-scene' }],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          insertSpy();
          return [{ id: `sess-${(state.insertCount += 1)}` }];
        },
      }),
    }),
  },
}));

import { sessionsRoute } from '../src/routes/sessions';
import { deleteRoom, getRoomByProject } from '../src/runtime';

const SECRET = 'test-secret';

function post(projectId: string, userId: string, userName: string, openaiKey?: string) {
  return sessionsRoute.request('/', {
    method: 'POST',
    headers: { 'x-internal-secret': SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      userId,
      userName,
      apiKey: 'sk-ant-test',
      ...(openaiKey ? { openaiKey } : {}),
    }),
  });
}

beforeEach(() => {
  process.env.ORCHESTRATOR_INTERNAL_SECRET = SECRET;
  startSpy.mockClear();
  exposeSpy.mockClear();
  spawnSpy.mockClear();
  insertSpy.mockClear();
  state.insertCount = 0;
  state.projectRow = null;
});

afterEach(() => {
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
});

describe('POST /sessions room reuse (STORY-32)', () => {
  it('rejects without the internal secret', async () => {
    const res = await sessionsRoute.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'p1', userId: 'u1', apiKey: 'k' }),
    });
    expect(res.status).toBe(403);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('first user creates the room; a second user joins the SAME session — one sandbox start, one session row', async () => {
    const projectId = 'reuse-seq';
    try {
      const res1 = await post(projectId, 'user-a', 'Ada');
      const res2 = await post(projectId, 'user-b', 'Babbage');
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = (await res1.json()) as {
        sessionId: string;
        ticket: string;
        previewUrl: string;
      };
      const body2 = (await res2.json()) as {
        sessionId: string;
        ticket: string;
        previewUrl: string;
      };

      // Same session + preview for both users; distinct one-time tickets.
      expect(body2.sessionId).toBe(body1.sessionId);
      expect(body2.previewUrl).toBe(body1.previewUrl);
      expect(body2.ticket).not.toBe(body1.ticket);

      // The expensive setup ran exactly once.
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(getRoomByProject(projectId)?.sessionId).toBe(body1.sessionId);
    } finally {
      const room = getRoomByProject(projectId);
      if (room) deleteRoom(room.sessionId);
    }
  });

  it('refuses an archived project (read-only cold storage, STORY-52) — no sandbox start', async () => {
    state.projectRow = { templateId: 'react-threejs-scene', archivedAt: new Date() };
    const res = await post('archived-proj', 'user-a', 'Ada');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'archived' });
    expect(startSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('two simultaneous first-joiners do not double-boot (per-project create-lock)', async () => {
    const projectId = 'reuse-race';
    try {
      const [res1, res2] = await Promise.all([
        post(projectId, 'user-a', 'Ada'),
        post(projectId, 'user-b', 'Babbage'),
      ]);
      const body1 = (await res1.json()) as { sessionId: string };
      const body2 = (await res2.json()) as { sessionId: string };

      expect(body1.sessionId).toBe(body2.sessionId);
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(insertSpy).toHaveBeenCalledTimes(1);
    } finally {
      const room = getRoomByProject(projectId);
      if (room) deleteRoom(room.sessionId);
    }
  });
});

describe('POST /sessions OpenAI key (STORY-38)', () => {
  it('holds the OpenAI key on the room when one is passed', async () => {
    const projectId = 'openai-set';
    try {
      const res = await post(projectId, 'user-a', 'Ada', 'sk-openai-test');
      expect(res.status).toBe(200);
      expect(getRoomByProject(projectId)?.openaiKey).toBe('sk-openai-test');
    } finally {
      const room = getRoomByProject(projectId);
      if (room) deleteRoom(room.sessionId);
    }
  });

  it('creates the session normally with no OpenAI key (image-gen simply unavailable)', async () => {
    const projectId = 'openai-absent';
    try {
      const res = await post(projectId, 'user-a', 'Ada');
      expect(res.status).toBe(200);
      const room = getRoomByProject(projectId);
      expect(room).toBeDefined();
      expect(room?.openaiKey).toBeUndefined();
    } finally {
      const room = getRoomByProject(projectId);
      if (room) deleteRoom(room.sessionId);
    }
  });

  it('keeps the first creator’s OpenAI key on room reuse', async () => {
    const projectId = 'openai-reuse';
    try {
      await post(projectId, 'user-a', 'Ada', 'sk-openai-first');
      await post(projectId, 'user-b', 'Babbage', 'sk-openai-second');
      // Room reuse: the live room keeps the first key (matches apiKey semantics).
      expect(getRoomByProject(projectId)?.openaiKey).toBe('sk-openai-first');
    } finally {
      const room = getRoomByProject(projectId);
      if (room) deleteRoom(room.sessionId);
    }
  });
});
