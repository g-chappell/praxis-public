import { type APIRequestContext, expect } from '@playwright/test';

// Teams are explicit since STORY-54 — projects can no longer be created by a
// teamless user (no auto-create). Specs that create a project must first give
// the signed-in user a team. Idempotent: a 409 already_in_team is fine, so the
// same context can call this more than once.
export async function ensureTeam(request: APIRequestContext, name = 'E2E Team'): Promise<void> {
  const res = await request.post('/api/teams', { data: { name } });
  expect(res.ok() || res.status() === 409).toBeTruthy();
}
