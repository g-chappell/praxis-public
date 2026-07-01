'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stamp } from '@/components/ui/stamp';
import type { TeamForUser, TeamMember } from '@/lib/teams';

// Team management on /settings (STORY-54/55/56). A user may own and belong to
// multiple teams, so this renders a panel: an always-available create form plus
// one card per team (each labelled with its name and its members by name). The
// owner can rename, invite a partner (until the team is full), and remove the
// partner; a member can leave. Bounds mirror lib/teams.ts (inlined — that module
// pulls in the server-only db client).
const TEAM_NAME_MAX = 60;
const TEAM_MAX_MEMBERS = 2;

export function TeamsPanel({ teams }: { teams: TeamForUser[] }) {
  return (
    <section data-testid="teams-panel" className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium">Teams</h2>
        <p className="text-sm text-muted-foreground">
          Build together — projects belong to a team, not a person. You can create or join more than
          one.
        </p>
      </div>

      <CreateTeam hasTeams={teams.length > 0} />

      {teams.map((team) => (
        <TeamCard key={team.id} team={team} />
      ))}
    </section>
  );
}

function CreateTeam({ hasTeams }: { hasTeams: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not create the team. Try again.');
        return;
      }
      setName('');
      setPending(false);
      router.refresh();
    } catch {
      setPending(false);
      setError('Could not create the team. Try again.');
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-5">
      {hasTeams ? (
        <h3 className="font-medium">Create another team</h3>
      ) : (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have a team yet. Create one to start building, or ask a teammate for an
          invite link.
        </p>
      )}
      <form data-testid="team-create-form" onSubmit={onSubmit} className="space-y-2">
        <Input
          data-testid="team-name-input"
          value={name}
          maxLength={TEAM_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          aria-label="Team name"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          variant="stamp"
          size="sm"
          data-testid="team-create-submit"
          disabled={pending || !name.trim()}
        >
          {pending ? 'Creating…' : 'Create team'}
        </Button>
      </form>
    </div>
  );
}

function TeamCard({ team }: { team: TeamForUser }) {
  const full = team.members.length >= TEAM_MAX_MEMBERS;
  return (
    <div data-testid="team-card" className="space-y-4 rounded-lg border p-5">
      <h3 data-testid="team-name" className="text-lg font-semibold">
        {team.name}
      </h3>

      {team.isOwner && <RenameTeam teamId={team.id} name={team.name} />}

      <ul className="divide-y rounded-md border">
        {team.members.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            teamId={team.id}
            canManage={team.isOwner}
          />
        ))}
      </ul>

      {team.isOwner ? (
        full ? (
          <p data-testid="team-full-note" className="text-xs text-muted-foreground">
            This team is full (a pair). Remove the partner to invite someone else.
          </p>
        ) : (
          <InviteControl teamId={team.id} />
        )
      ) : (
        <LeaveTeamButton teamId={team.id} />
      )}
    </div>
  );
}

function RenameTeam({ teamId, name: initialName }: { teamId: string; name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== initialName && name.trim().length > 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not rename the team. Try again.');
        return;
      }
      setPending(false);
      router.refresh();
    } catch {
      setPending(false);
      setError('Could not rename the team. Try again.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label
        htmlFor={`team-rename-${teamId}`}
        className="text-xs font-medium text-muted-foreground"
      >
        Rename team
      </label>
      <div className="flex items-start gap-2">
        <Input
          id={`team-rename-${teamId}`}
          data-testid="team-rename-input"
          value={name}
          maxLength={TEAM_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          variant="stamp"
          size="sm"
          data-testid="team-rename-save"
          disabled={pending || !dirty}
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

function InviteControl({ teamId }: { teamId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/teams/${teamId}/invites`, { method: 'POST' });
      if (!res.ok) {
        setPending(false);
        setError('Could not create an invite link.');
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      setLink(url ?? null);
      setPending(false);
    } catch {
      setPending(false);
      setError('Could not create an invite link.');
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!link) {
    return (
      <div className="space-y-1">
        <Button
          variant="stamp"
          size="sm"
          data-testid="team-invite-button"
          onClick={mint}
          disabled={pending}
        >
          {pending ? 'Creating…' : 'Invite partner'}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Share this single-use link with your partner:</p>
      <div className="flex items-center gap-2">
        <Input data-testid="team-invite-link" value={link} readOnly />
        <Button variant="stamp" size="sm" data-testid="team-invite-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function RemoveMemberButton({ teamId, userId }: { teamId: string; userId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!window.confirm('Remove this partner from the team? They lose access to its projects.')) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="team-member-remove"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? 'Removing…' : 'Remove'}
    </Button>
  );
}

function LeaveTeamButton({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!window.confirm('Leave this team? You lose access to its projects.')) return;
    setPending(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/leave`, { method: 'POST' });
      if (!res.ok) {
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid="team-leave-button"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? 'Leaving…' : 'Leave team'}
    </Button>
  );
}

function MemberRow({
  member,
  teamId,
  canManage,
}: {
  member: TeamMember;
  teamId: string;
  canManage: boolean;
}) {
  // Display name falls back to email when absent — and an empty/whitespace
  // display name counts as absent (Better Auth seeds it to '' on signup, not
  // null, so `?? email` alone would render a blank row).
  const name = member.displayName?.trim();
  return (
    <li data-testid="team-member-row" className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name || member.email}</p>
        {name && name !== member.email && (
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {member.isOwner ? (
          <Stamp data-testid="team-member-owner-badge">Owner</Stamp>
        ) : (
          <Stamp>Partner</Stamp>
        )}
        {member.joinedAt && (
          <span className="text-xs text-muted-foreground">
            Joined {member.joinedAt.toLocaleDateString()}
          </span>
        )}
        {canManage && !member.isOwner && (
          <RemoveMemberButton teamId={teamId} userId={member.userId} />
        )}
      </div>
    </li>
  );
}
