// Team helpers (STORY-54/55). Teams are explicit: a user deliberately creates a
// named team (becoming its owner) or joins one via invite — they are not
// auto-created. Ownership is derived from teams.createdBy (no role column on
// team_memberships). A user may own and belong to multiple teams (STORY-55); the
// owner always holds a membership row, so "teams I'm in" = my membership rows.
// The `database` is injectable for persistence tests; it defaults to the
// @praxis/db/client singleton.

import { and, asc, desc, eq } from 'drizzle-orm';

import { teamMemberships, teams, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

import { recordAudit } from '@/lib/audit';

/** Max team-name length, shared by the HTTP boundary and the create/rename form. */
export const TEAM_NAME_MAX = 60;

/** A team is a pair: at most this many members (STORY-56). Enforced on join
 *  (acceptInvite) and on invite mint (createTeamInvite); never forces out an
 *  existing member, so an over-cap team is only reconciled by removing members. */
export const TEAM_MAX_MEMBERS = 2;

export interface TeamMember {
  userId: string;
  email: string;
  displayName: string | null;
  isOwner: boolean;
  joinedAt: Date | null;
}

export interface TeamForUser {
  id: string;
  name: string;
  isOwner: boolean;
  members: TeamMember[];
}

/** Validate an untrusted team name (pure — no DB): a non-empty string ≤
 *  TEAM_NAME_MAX after trim. Returns the trimmed name, or an error the caller
 *  maps to a 400. */
export function parseTeamName(value: unknown): { name: string } | { error: 'invalid_name' } {
  if (typeof value !== 'string') return { error: 'invalid_name' };
  const name = value.trim();
  if (!name || name.length > TEAM_NAME_MAX) return { error: 'invalid_name' };
  return { name };
}

/** Every team the user owns or belongs to (with each team's members), newest
 *  team first; empty when they're in none. The owner always holds a membership
 *  row, so a single pass over the user's memberships (joined to teams for the
 *  sort) covers both owned and partner teams. A member is the owner iff they
 *  created the team. Within a team, members are oldest-joined first (owner leads). */
export async function getTeamsForUser(
  userId: string,
  database: Database = db,
): Promise<TeamForUser[]> {
  const memberships = await database
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(eq(teamMemberships.userId, userId))
    .orderBy(desc(teams.createdAt));

  const hydrated = await Promise.all(
    memberships.map((m) => getTeamById(m.teamId, userId, database)),
  );
  return hydrated.filter((t): t is TeamForUser => t !== null);
}

/** Hydrate a team + its members, computing `isOwner` for the viewer. Internal —
 *  callers reach a team through getTeamsForUser / createTeam / renameTeam. */
async function getTeamById(
  teamId: string,
  viewerId: string,
  database: Database,
): Promise<TeamForUser | null> {
  const [team] = await database
    .select({ id: teams.id, name: teams.name, createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const rows = await database
    .select({
      userId: teamMemberships.userId,
      email: users.email,
      displayName: users.displayName,
      joinedAt: teamMemberships.joinedAt,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(eq(teamMemberships.teamId, teamId))
    .orderBy(asc(teamMemberships.joinedAt));

  const members: TeamMember[] = rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    displayName: r.displayName,
    isOwner: r.userId === team.createdBy,
    joinedAt: r.joinedAt,
  }));

  return { id: team.id, name: team.name, isOwner: team.createdBy === viewerId, members };
}

export type CreateTeamResult = { team: TeamForUser } | { error: 'invalid_name' };

/** Create a team owned by `userId` from an untrusted name. 400 (invalid_name) if
 *  the name is empty/too long. A user may own multiple teams (STORY-55), so there
 *  is no "already in a team" guard. On success the creator is the owner member.
 *  Sequential inserts (no transaction) match the codebase style. */
export async function createTeam(
  userId: string,
  rawName: unknown,
  database: Database = db,
): Promise<CreateTeamResult> {
  const parsed = parseTeamName(rawName);
  if ('error' in parsed) return { error: parsed.error };

  const [team] = await database
    .insert(teams)
    .values({ name: parsed.name, createdBy: userId })
    .returning({ id: teams.id });
  await database.insert(teamMemberships).values({ teamId: team!.id, userId });

  const hydrated = await getTeamById(team!.id, userId, database);
  return { team: hydrated! };
}

export type RenameTeamResult =
  | { team: TeamForUser }
  | { error: 'invalid_name' | 'not_owner' | 'not_found' };

/** Rename a team. Owner-gated: 403 (not_owner) for a non-owner, 404 (not_found)
 *  if the team is gone, 400 (invalid_name) for an empty/too-long name. Writes a
 *  team.renamed audit row on success. */
export async function renameTeam(
  userId: string,
  teamId: string,
  rawName: unknown,
  database: Database = db,
): Promise<RenameTeamResult> {
  const parsed = parseTeamName(rawName);
  if ('error' in parsed) return { error: parsed.error };

  const [team] = await database
    .select({ id: teams.id, createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { error: 'not_found' };
  if (team.createdBy !== userId) return { error: 'not_owner' };

  await database.update(teams).set({ name: parsed.name }).where(eq(teams.id, teamId));
  await recordAudit(
    userId,
    'team.renamed',
    { targetType: 'team', targetId: teamId, metadata: { name: parsed.name } },
    database,
  );

  const hydrated = await getTeamById(teamId, userId, database);
  return { team: hydrated! };
}

export type RemoveMemberResult =
  | { ok: true }
  | { error: 'not_found' | 'not_owner' | 'cannot_remove_owner' };

/** Remove a member from a team (STORY-56). Owner-gated: 403 (not_owner) for a
 *  non-owner, 404 (not_found) if the team is gone, 400 (cannot_remove_owner) if
 *  the target is the owner (the owner can't remove themselves and can't be
 *  removed). Deletes the membership and audits team.member_removed only when a
 *  row was actually removed — so a repeat call is an idempotent ok. */
export async function removeMember(
  ownerId: string,
  teamId: string,
  targetUserId: string,
  database: Database = db,
): Promise<RemoveMemberResult> {
  const [team] = await database
    .select({ createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { error: 'not_found' };
  if (team.createdBy !== ownerId) return { error: 'not_owner' };
  if (targetUserId === team.createdBy) return { error: 'cannot_remove_owner' };

  const removed = await database
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, targetUserId)))
    .returning({ userId: teamMemberships.userId });
  if (removed.length > 0) {
    await recordAudit(
      ownerId,
      'team.member_removed',
      { targetType: 'team', targetId: teamId, metadata: { removed: targetUserId } },
      database,
    );
  }
  return { ok: true };
}

export type LeaveTeamResult = { ok: true } | { error: 'not_found' | 'owner_cannot_leave' };

/** Leave a team you don't own (STORY-56). 404 (not_found) if the team is gone,
 *  409 (owner_cannot_leave) if you're the owner — the owner reconciles via
 *  removeMember and can't abandon their team this pass. Deletes your own
 *  membership and audits team.member_left only when a row was removed (idempotent). */
export async function leaveTeam(
  userId: string,
  teamId: string,
  database: Database = db,
): Promise<LeaveTeamResult> {
  const [team] = await database
    .select({ createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { error: 'not_found' };
  if (team.createdBy === userId) return { error: 'owner_cannot_leave' };

  const left = await database
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
    .returning({ userId: teamMemberships.userId });
  if (left.length > 0) {
    await recordAudit(
      userId,
      'team.member_left',
      { targetType: 'team', targetId: teamId },
      database,
    );
  }
  return { ok: true };
}
