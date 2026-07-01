// Per-turn git author attribution (STORY-17 / TASK-151). The shared agent is
// persistent across turns and users (ADR-0016), so author identity can't be a
// spawn-time env var — instead, before each turn we set the workspace's local
// git identity to the prompting user. Commits the agent makes during that turn
// are then authored by whoever prompted; turns run one at a time (serialised
// queue / turn-based handoff, STORY-34), so there's no interleaving.
//
// Setting repo-local user.name/user.email covers both author and committer (git
// derives both from these unless explicitly overridden), which is what GIT_AUTHOR_*
// + GIT_COMMITTER_* env vars would have done on a per-process agent. Operates
// entirely through the existing Sandbox.exec API — no AcpHost/Sandbox shape change,
// so no ADR is required.

import { eq } from 'drizzle-orm';

import { projects, users } from '@praxis/db';
import { db } from '@praxis/db/client';
import type { Sandbox, SandboxHandle } from '@praxis/sandbox';

export interface GitIdentity {
  name: string;
  email: string;
}

interface UserRow {
  displayName: string | null;
  email: string | null;
}

// Fallback when neither prompter nor owner resolves — mirrors the template-seed
// identity in docker-sandbox so unattributed commits stay consistent.
export const DEFAULT_GIT_IDENTITY: GitIdentity = { name: 'Praxis', email: 'agent@praxis.local' };

/** Pure fallback chain: prompting user → project owner → Praxis default. A row
 *  qualifies only if it carries an email (a commit author needs one); the name
 *  falls back to the email when displayName is empty. */
export function gitIdentity(prompter?: UserRow, owner?: UserRow): GitIdentity {
  const pick = (u?: UserRow): GitIdentity | null =>
    u && u.email ? { name: u.displayName?.trim() || u.email, email: u.email } : null;
  return pick(prompter) ?? pick(owner) ?? DEFAULT_GIT_IDENTITY;
}

async function lookupUser(userId: string | undefined): Promise<UserRow | undefined> {
  if (!userId) return undefined;
  const [row] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

async function lookupOwner(projectId: string): Promise<UserRow | undefined> {
  const [row] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(projects)
    .innerJoin(users, eq(projects.createdBy, users.id))
    .where(eq(projects.id, projectId));
  return row;
}

/** Resolve and apply the workspace git identity for the upcoming turn. Identity
 *  values are passed via env (not interpolated into the command) so a name/email
 *  can't break or inject into the shell. */
export async function applyTurnGitAuthor(
  sandbox: Sandbox,
  handle: SandboxHandle,
  projectId: string,
  promptingUserId: string | undefined,
): Promise<GitIdentity> {
  const [prompter, owner] = await Promise.all([
    lookupUser(promptingUserId),
    lookupOwner(projectId),
  ]);
  const identity = gitIdentity(prompter, owner);
  await sandbox.exec(
    handle,
    'cd /workspace && git config user.name "$GN" && git config user.email "$GE"',
    { env: { GN: identity.name, GE: identity.email } },
  );
  return identity;
}

/** A concise commit subject from the user's prompt: first non-empty line,
 *  trimmed, capitalized, and truncated — so the turn-end commit describes what was
 *  asked rather than a generic placeholder. Falls back when the prompt is empty.
 *  Auto-commit-by-agent-guidance is unreliable (the adapter loads CLAUDE.md, but
 *  the model won't reliably commit on its own), so the host-side commit is the
 *  source of truth and owns the message. */
export function commitMessageFromPrompt(prompt: string): string {
  const firstLine =
    prompt
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';
  if (!firstLine) return 'Checkpoint: save changes from this turn';
  const capped = firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

/** Safety-net commit (STORY-17 AC#1): after a turn, commit any work left
 *  uncommitted so the git panel always reflects what was built. Uses the repo
 *  identity set by applyTurnGitAuthor, so it's attributed to the prompter, and
 *  `message` (derived from the prompt) so the history reads as the build story.
 *  No-op when the tree is clean (the agent already committed). The agent's store
 *  dir is in .git/info/exclude, so `git add -A` never stages it. The message is
 *  passed via env so it can't break or inject into the shell. Best-effort — the
 *  caller logs failures and never fails the turn on a commit error. */
export async function commitTurnWork(
  sandbox: Sandbox,
  handle: SandboxHandle,
  message: string,
): Promise<void> {
  await sandbox.exec(
    handle,
    'cd /workspace && git add -A && { git diff --cached --quiet || git commit -q -m "$CM"; }',
    { env: { CM: message } },
  );
}
