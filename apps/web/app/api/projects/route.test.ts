// Unit tests for POST /api/projects. Mocks the lib + db boundaries: a create
// inserts under the local user and returns the new id; an unknown template 400s.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const returning = vi.fn();
const isTemplateId = vi.fn();

vi.mock('@/lib/current-user', () => ({
  getCurrentUser: async () => ({
    id: 'local-user',
    email: 'you@localhost',
    name: 'You',
    image: null,
  }),
}));
vi.mock('@/lib/projects', () => ({
  parseProjectStatus: () => 'active',
  parseProjectSort: () => 'recent',
  listUserProjects: vi.fn(),
}));
vi.mock('@/lib/templates', () => ({
  isTemplateId: (...a: unknown[]) => isTemplateId(...a),
  DEFAULT_TEMPLATE_ID: 'react-threejs-scene',
}));
vi.mock('@praxis/db', () => ({ projects: {} }));
vi.mock('@praxis/db/client', () => ({
  db: { insert: () => ({ values: () => ({ returning: () => returning() }) }) },
}));

import { POST } from './route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isTemplateId.mockReturnValue(true);
});

describe('POST /api/projects', () => {
  it('creates the project and returns its id', async () => {
    returning.mockResolvedValue([{ id: 'proj-1' }]);
    const res = await post({ name: 'P', templateId: 'react-threejs-scene' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'proj-1' });
  });

  it('400 for an explicit unknown template — creates nothing', async () => {
    isTemplateId.mockReturnValue(false);
    const res = await post({ name: 'P', templateId: 'nope' });
    expect(res.status).toBe(400);
    expect(returning).not.toHaveBeenCalled();
  });
});
