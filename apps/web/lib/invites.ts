// Team invite links (STORY-31/56). The team owner mints a single-use code bound
// to a team; whoever redeems it joins that team and thereby gains access to its
// projects (userOwnsProject is team-scoped). Built on the team_invites table —
// no schema change. Single-use: the claim is an atomic conditional UPDATE so
// concurrent redemptions can't both win. Joining is capped per team (STORY-56).

import { randomBytes } from 'node:crypto';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { projects, teamInvites, teamMemberships, teams } from '@praxis/db';
import { type Database, db as defaultDb } from '@praxis/db/client';

import { TEAM_MAX_MEMBERS } from '@/lib/teams';

interface Deps {
  /** Injectable for tests; defaults to the lazy @praxis/db/client singleton. */
  db?: Database;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CreatedInvite {
  code: string;
  expiresAt: Date;
}

export type CreateTeamInviteResult =
  | { invite: CreatedInvite }
  | { error: 'not_found' | 'not_owner' | 'team_full' };

/** Mint a single-use, 7-day invite for a team the caller OWNS (STORY-56) —
 *  the team-level generalization of {@link createInvite}, with no project.
 *  Owner-gated (not_owner), 404 (not_found) if the team is gone, and refused
 *  once the team is at the cap (team_full). */
export async function createTeamInvite(
  userId: string,
  teamId: string,
  { db = defaultDb }: Deps = {},
): Promise<CreateTeamInviteResult> {
  const [team] = await db
    .select({ createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { error: 'not_found' };
  if (team.createdBy !== userId) return { error: 'not_owner' };
  if ((await memberCount(db, teamId)) >= TEAM_MAX_MEMBERS) return { error: 'team_full' };

  const code = randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(teamInvites).values({ teamId, inviteCode: code, expiresAt });
  return { invite: { code, expiresAt } };
}

export type AcceptResult =
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'team_full' }
  | { status: 'ok'; teamId: string; projectId: string | null; alreadyMember: boolean };

/** Redeem an invite code for a user. Validates the code, no-ops if they're
 *  already on the team (without consuming it), else atomically claims the
 *  single-use invite and adds the membership. */
export async function acceptInvite(
  userId: string,
  code: string,
  { db = defaultDb }: Deps = {},
): Promise<AcceptResult> {
  const [invite] = await db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.inviteCode, code))
    .limit(1);
  if (!invite) return { status: 'invalid' };
  if (invite.expiresAt.getTime() < Date.now()) return { status: 'expired' };
  if (invite.acceptedBy && invite.acceptedBy !== userId) return { status: 'used' };

  const teamId = invite.teamId;
  const projectId = await newestProjectId(db, teamId);

  // Already on the team (e.g. the owner opening their own link, or a re-open by
  // the original acceptor): no write, and don't consume the code. Checked before
  // the cap so an existing member's re-open still succeeds on a full team.
  if (await isMember(db, teamId, userId)) {
    return { status: 'ok', teamId, projectId, alreadyMember: true };
  }

  // Cap of 2 per team (STORY-56): a fresh joiner is refused once the team is
  // full. The invite is left unconsumed so the owner can still reconcile.
  if ((await memberCount(db, teamId)) >= TEAM_MAX_MEMBERS) {
    return { status: 'team_full' };
  }

  // Claim the single-use invite atomically: only the redemption that flips
  // accepted_by from NULL proceeds to add the membership. A concurrent loser
  // gets no row back.
  const claimed = await db
    .update(teamInvites)
    .set({ acceptedBy: userId })
    .where(and(eq(teamInvites.id, invite.id), isNull(teamInvites.acceptedBy)))
    .returning({ id: teamInvites.id });

  if (claimed.length === 0) {
    // Lost the race. If we somehow ended up as the acceptor, fall through as a
    // member; otherwise someone else took the single use.
    const [after] = await db
      .select({ acceptedBy: teamInvites.acceptedBy })
      .from(teamInvites)
      .where(eq(teamInvites.id, invite.id))
      .limit(1);
    if (after?.acceptedBy !== userId) return { status: 'used' };
  }

  await db.insert(teamMemberships).values({ teamId, userId }).onConflictDoNothing();
  return { status: 'ok', teamId, projectId, alreadyMember: false };
}

/** Current member count for a team — used to enforce the per-team cap. */
async function memberCount(db: Database, teamId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamMemberships)
    .where(eq(teamMemberships.teamId, teamId));
  return row?.n ?? 0;
}

async function isMember(db: Database, teamId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: teamMemberships.userId })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** The team's newest project, used as the post-accept landing target. */
async function newestProjectId(db: Database, teamId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(projects.createdAt))
    .limit(1);
  return row?.id ?? null;
}
