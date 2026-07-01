// Admin-only user data access (STORY-45). Like lib/admin-projects.ts this is a
// deliberately separate, admin-scoped module — every consumer must gate on
// isUserAdmin at the route. POC scale: aggregates are grouped DB queries and the
// search/sort run over the merged rows.

import { desc, eq, inArray, sql } from 'drizzle-orm';

import { auditLog, projects, sessions, teamMemberships, teams, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

/** A row in the admin users directory. */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  bannedAt: Date | null;
  createdAt: Date | null;
  projectCount: number;
}

export type AdminUserSort = 'recent' | 'oldest' | 'email';

export function parseAdminUserSort(value: unknown): AdminUserSort {
  return value === 'oldest' || value === 'email' ? value : 'recent';
}

/** Every user with their role, banned status, created date, and the number of
 *  projects in teams they belong to. Filtered by a free-text query over
 *  email/name, sorted. The `database` is injectable for persistence tests. */
export async function adminListUsers(
  opts: { q?: string; sort?: AdminUserSort } = {},
  database: Database = db,
): Promise<AdminUserRow[]> {
  const sort = opts.sort ?? 'recent';
  const q = opts.q?.trim().toLowerCase();

  const base = await database
    .select({
      id: users.id,
      email: users.email,
      name: users.displayName,
      role: users.role,
      bannedAt: users.bannedAt,
      createdAt: users.createdAt,
    })
    .from(users);

  // Projects per user = distinct projects across the teams they're a member of.
  const counts = await database
    .select({
      userId: teamMemberships.userId,
      count: sql<number>`count(distinct ${projects.id})::int`,
    })
    .from(teamMemberships)
    .leftJoin(projects, eq(projects.teamId, teamMemberships.teamId))
    .groupBy(teamMemberships.userId);
  const countByUser = new Map(counts.map((c) => [c.userId, c.count]));

  let rows: AdminUserRow[] = base.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    bannedAt: u.bannedAt,
    createdAt: u.createdAt,
    projectCount: countByUser.get(u.id) ?? 0,
  }));

  if (q) {
    rows = rows.filter(
      (r) => r.email.toLowerCase().includes(q) || (r.name?.toLowerCase().includes(q) ?? false),
    );
  }

  const time = (d: Date | null) => (d ? d.getTime() : 0);
  rows.sort((a, b) => {
    if (sort === 'email') return a.email.localeCompare(b.email);
    if (sort === 'oldest') return time(a.createdAt) - time(b.createdAt);
    return time(b.createdAt) - time(a.createdAt); // recent (default)
  });

  return rows;
}

export interface AdminUserProject {
  id: string;
  name: string;
  teamName: string;
  archivedAt: Date | null;
}

export interface AdminUserSession {
  id: string;
  projectId: string;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface AdminUserActivity {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: Date | null;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date | null;
  projects: AdminUserProject[];
  recentSessions: AdminUserSession[];
  recentActivity: AdminUserActivity[];
}

/** Full admin view of one user: profile + the projects in their teams, recent
 *  sessions across those projects, and their recent audited actions. Returns null
 *  when the user doesn't exist. Admin-only — gate at the route/page. */
export async function adminGetUser(
  userId: string,
  database: Database = db,
): Promise<AdminUserDetail | null> {
  const [user] = await database
    .select({
      id: users.id,
      email: users.email,
      name: users.displayName,
      role: users.role,
      bannedAt: users.bannedAt,
      banReason: users.banReason,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const userProjects = await database
    .select({
      id: projects.id,
      name: projects.name,
      teamName: teams.name,
      archivedAt: projects.archivedAt,
    })
    .from(teamMemberships)
    .innerJoin(projects, eq(projects.teamId, teamMemberships.teamId))
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(eq(teamMemberships.userId, userId))
    .orderBy(desc(projects.createdAt));

  const projectIds = userProjects.map((p) => p.id);
  const recentSessions = projectIds.length
    ? await database
        .select({
          id: sessions.id,
          projectId: sessions.projectId,
          startedAt: sessions.startedAt,
          endedAt: sessions.endedAt,
        })
        .from(sessions)
        .where(inArray(sessions.projectId, projectIds))
        .orderBy(desc(sessions.startedAt))
        .limit(10)
    : [];

  const recentActivity = await database
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.actorUserId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(10);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    bannedAt: user.bannedAt,
    banReason: user.banReason,
    createdAt: user.createdAt,
    projects: userProjects,
    recentSessions,
    recentActivity,
  };
}

/** Ban (set bannedAt + banReason) or unban (clear both) a user by id (STORY-46).
 *  No self/last-admin guard here — the route enforces those. Returns false when
 *  the user doesn't exist. */
export async function adminSetUserBanned(
  userId: string,
  banned: boolean,
  reason: string | null,
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .update(users)
    .set({ bannedAt: banned ? new Date() : null, banReason: banned ? reason : null })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return Boolean(row);
}

/** A user's current role, or null when they don't exist — for the role-change
 *  guards (self-demotion / last-admin) before mutating. */
export async function getUserRole(
  userId: string,
  database: Database = db,
): Promise<'user' | 'admin' | null> {
  const [row] = await database
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role ?? null;
}

/** Number of admins — used to block removing the last one (STORY-45 / TASK-130). */
export async function countAdmins(database: Database = db): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'admin'));
  return row?.count ?? 0;
}

/** Set a user's role by id (admin role management, STORY-45). No self/last-admin
 *  guard here — the route enforces those. Returns false when the user doesn't
 *  exist. */
export async function adminSetUserRole(
  userId: string,
  role: 'user' | 'admin',
  database: Database = db,
): Promise<boolean> {
  const [row] = await database
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return Boolean(row);
}
