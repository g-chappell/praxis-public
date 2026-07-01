'use client';

import { Avatar } from '@/components/workspace/chat-message';
import { uniqueByUser, useWorkspacePresence } from '@/components/workspace/workspace-presence';
import { cn } from '@/lib/utils';

// The live presence roster (STORY-11/TASK-033), shown in the files-pane header:
// every user currently in the project, with avatar + name and the file they're
// viewing. This client is tagged "you".
export function PresenceBar() {
  const { members, myConnId } = useWorkspacePresence();
  const people = uniqueByUser(members);
  if (people.length === 0) return null;

  const myUserId = members.find((m) => m.connId === myConnId)?.userId ?? null;

  return (
    <div className="border-b-2 px-3 py-2">
      <span className="label-mono">Who&apos;s here</span>
      <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {people.map((m) => {
          const isMe = m.userId === myUserId;
          const file = m.filePath ? m.filePath.split('/').pop() : null;
          return (
            <li
              key={m.userId}
              className={cn(
                'flex items-center gap-1.5 border-2 py-0.5 pl-0.5 pr-2 text-xs',
                isMe ? 'border-stamp' : 'border-border',
              )}
              title={m.filePath ? `${m.userName} — ${m.filePath}` : m.userName}
            >
              <Avatar name={m.userName} image={m.userImage} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="max-w-[8rem] truncate font-semibold">
                  {m.userName}
                  {isMe && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {file && (
                  <span className="max-w-[8rem] truncate font-mono text-[0.6rem] text-muted-foreground">
                    {file}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
