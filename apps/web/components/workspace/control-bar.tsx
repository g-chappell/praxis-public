'use client';

import { Button } from '@/components/ui/button';
import { Stamp } from '@/components/ui/stamp';
import { useWorkspaceControl } from '@/components/workspace/workspace-control';
import { uniqueByUser, useWorkspacePresence } from '@/components/workspace/workspace-presence';

// Prompt-control bar in the workspace header (STORY-34). Shows the active mode
// (owner-editable toggle, read-only for others) and, in turn-based mode, who holds
// control plus the handoff controls (request / approve / decline / release / pass).
export function ControlBar() {
  const c = useWorkspaceControl();
  const { members } = useWorkspacePresence();
  const people = uniqueByUser(members);
  const nameOf = (userId: string) => people.find((m) => m.userId === userId)?.userName ?? 'a user';

  const iRequested = c.myUserId !== null && c.requests.includes(c.myUserId);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b-2 px-3 py-2 text-xs">
      <span className="label-mono">Mode</span>
      {c.isOwner ? (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={c.mode === 'serialised' ? 'default' : 'outline'}
            onClick={() => c.setMode('serialised')}
          >
            Anyone
          </Button>
          <Button
            size="sm"
            variant={c.mode === 'turn_based' ? 'default' : 'outline'}
            onClick={() => c.setMode('turn_based')}
          >
            Take turns
          </Button>
        </div>
      ) : (
        <span className="font-semibold">{c.mode === 'turn_based' ? 'Take turns' : 'Anyone'}</span>
      )}

      {c.mode === 'turn_based' &&
        (c.isHolder ? (
          <div className="flex flex-wrap items-center gap-2">
            <Stamp solid>You have control</Stamp>
            <Button size="sm" variant="outline" onClick={c.releaseControl}>
              Release
            </Button>
            {people
              .filter((m) => m.userId !== c.myUserId)
              .map((m) => (
                <Button
                  key={m.userId}
                  size="sm"
                  variant="outline"
                  onClick={() => c.passControl(m.userId)}
                >
                  Pass to {m.userName}
                </Button>
              ))}
            {c.requests.map((uid) => (
              <span key={uid} className="flex items-center gap-1 border-2 px-1.5 py-0.5">
                <span>{nameOf(uid)} wants control</span>
                <Button size="sm" onClick={() => c.grantControl(uid)}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => c.declineControl(uid)}>
                  Decline
                </Button>
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {c.controlHolder ? `${nameOf(c.controlHolder)} has control` : 'No one has control'}
            </span>
            {iRequested ? (
              <span className="text-muted-foreground">Requested…</span>
            ) : (
              <Button size="sm" variant="outline" onClick={c.requestControl}>
                Request control
              </Button>
            )}
          </div>
        ))}
    </div>
  );
}
