'use client';

import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/workspace/chat-message';
import { useWorkspaceControl } from '@/components/workspace/workspace-control';

// The serialised-mode prompt queue (STORY-34): the pending prompts waiting to run,
// each attributed to its author. A user can cancel their own queued prompt.
export function PromptQueue() {
  const c = useWorkspaceControl();
  if (c.mode !== 'serialised' || c.queue.length === 0) return null;

  return (
    <div className="border-2 p-2 text-xs">
      <p className="label-mono mb-1">Queued ({c.queue.length})</p>
      <ul className="space-y-1">
        {c.queue.map((q) => (
          <li key={q.id} className="flex items-center gap-2">
            <Avatar name={q.author.name} image={q.author.image} />
            <span className="min-w-0 flex-1 truncate">{q.text}</span>
            {q.userId === c.myUserId && (
              <Button size="sm" variant="outline" onClick={() => c.cancelQueued(q.id)}>
                Cancel
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
