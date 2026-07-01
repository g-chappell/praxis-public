// @vitest-environment jsdom
// Admin overview dashboard (STORY-48): renders live tiles + recent actions and
// degrades the running-sandboxes tile when the orchestrator is unavailable.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AdminOverview } from '@/lib/admin-overview';

import { AdminOverviewDashboard } from './admin-overview-dashboard';

const base: AdminOverview = {
  counts: { users: 12, projectsActive: 5, projectsArchived: 3 },
  keys: [
    { provider: 'anthropic', configured: true, maskedKey: 'sk-…ABCD', lastRotatedAt: null },
    { provider: 'openai', configured: false, maskedKey: null, lastRotatedAt: null },
  ],
  recentActions: [
    {
      id: 'a1',
      action: 'project.deleted',
      actorUserId: 'u1',
      actorEmail: 'ada@example.test',
      targetType: 'project',
      targetId: 'p1',
      metadata: null,
      ip: null,
      createdAt: new Date('2026-06-07T00:00:00Z'),
    },
  ],
  orchestrator: { runningSandboxes: 4, gitSha: 'abcdef1234', uptimeSec: 100 },
};

afterEach(cleanup);

describe('AdminOverviewDashboard', () => {
  it('renders the live count + running-sandbox tiles and recent actions', () => {
    render(<AdminOverviewDashboard overview={base} />);
    expect(screen.getByText('12')).toBeTruthy(); // users
    expect(screen.getByText('5')).toBeTruthy(); // active projects
    expect(screen.getByText('4')).toBeTruthy(); // running sandboxes
    expect(screen.getByText('1/2')).toBeTruthy(); // configured keys
    expect(screen.getByText('project.deleted')).toBeTruthy();
    expect(screen.getByText('by ada@example.test')).toBeTruthy();
  });

  it('shows "Unavailable" when the orchestrator health is absent', () => {
    render(<AdminOverviewDashboard overview={{ ...base, orchestrator: null }} />);
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('orchestrator offline')).toBeTruthy();
  });

  it('shows an empty state when there are no recent actions', () => {
    render(<AdminOverviewDashboard overview={{ ...base, recentActions: [] }} />);
    expect(screen.getByText('No admin actions yet.')).toBeTruthy();
  });
});
