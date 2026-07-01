import { Monogram } from '@/components/ui/monogram';
import { cn } from '@/lib/utils';

// Typed chat messages + their presentational rendering (TASK-032). Pure (no
// socket), so ChatPanel feeds it state and the snapshot test renders it directly.
// User prompts are attributed to the prompting user (ink monogram); agent-produced
// kinds read as the "Assistant" (oxblood monogram) while still naming the user who
// prompted, so multiplayer attribution (STORY-32) survives.

export interface ChatAuthor {
  name: string;
  image?: string | null;
}

export type ChatMessage =
  | { id: string; kind: 'user'; author: ChatAuthor; text: string }
  | { id: string; kind: 'text'; author: ChatAuthor; text: string }
  | { id: string; kind: 'tool_call'; author: ChatAuthor; title: string }
  | { id: string; kind: 'file_change'; author: ChatAuthor; change: string; path: string }
  | { id: string; kind: 'error'; author: ChatAuthor; text: string };

/** Up to two initials from a display name (or email local-part) for the avatar. */
export function initials(name: string): string {
  const base = name.includes('@') ? name.slice(0, name.indexOf('@')) : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const picked =
    parts.length >= 2
      ? `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`
      : (parts[0] ?? base).slice(0, 2);
  return picked.toUpperCase() || '?';
}

/** Square monogram for a chat author (no photos — index-card feel). */
export function Avatar({ name }: ChatAuthor) {
  return <Monogram name={name} size="sm" />;
}

const AGENT_KINDS = new Set<ChatMessage['kind']>(['text', 'tool_call', 'file_change', 'error']);

const CHANGE_VERB: Record<string, string> = {
  create: 'wrote',
  modify: 'edited',
  delete: 'deleted',
};

export function ChatMessageView({ message, index }: { message: ChatMessage; index?: number }) {
  const isAgent = AGENT_KINDS.has(message.kind);
  return (
    <li className="flex gap-2.5 text-sm">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        {index != null && (
          <span className="font-mono text-[0.6rem] text-muted-foreground">
            {String(index).padStart(2, '0')}
          </span>
        )}
        {isAgent ? (
          <Monogram name="AI" variant="stamp" size="sm" title="Assistant" />
        ) : (
          <Monogram name={message.author.name} variant="ink" size="sm" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isAgent ? (
            <>
              <span className="font-semibold">Assistant</span>
              <span className="truncate text-xs italic text-muted-foreground">
                · for {message.author.name}
              </span>
            </>
          ) : (
            <span className="truncate font-semibold">{message.author.name}</span>
          )}
        </div>
        <MessageBody message={message} />
      </div>
    </li>
  );
}

function MessageBody({ message }: { message: ChatMessage }) {
  switch (message.kind) {
    case 'user':
    case 'text':
      return <p className="whitespace-pre-wrap break-words">{message.text}</p>;
    case 'tool_call':
      return (
        <p className="text-muted-foreground">
          <span aria-hidden>🔧 </span>Ran <span className="font-medium">{message.title}</span>
        </p>
      );
    case 'file_change':
      return (
        <p className="font-mono text-xs text-stamp">
          <span aria-hidden>✎ </span>
          {CHANGE_VERB[message.change] ?? message.change}{' '}
          <span className="font-bold">{message.path}</span>
        </p>
      );
    case 'error':
      return <p className="text-destructive">{message.text}</p>;
  }
}

export function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  return (
    <ul className={cn('flex-1 space-y-3 overflow-y-auto')}>
      {messages.map((message, i) => (
        <ChatMessageView key={message.id} message={message} index={i + 1} />
      ))}
    </ul>
  );
}
