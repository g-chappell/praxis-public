'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Monogram } from '@/components/ui/monogram';
import {
  type ChatAuthor,
  type ChatMessage,
  ChatTranscript,
} from '@/components/workspace/chat-message';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// Session chat, reading the workspace socket. Renders the agent's typed event
// kinds (text / tool_call / file_change / error) and the user's prompts. No
// interactive tool permissions yet (auto-allowed).
export function ChatPanel({ currentUser }: { currentUser: ChatAuthor }) {
  const { status: socketStatus, start, close, send, subscribe } = useWorkspaceSocket();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [errored, setErrored] = useState(false);
  // A transient, non-fatal notice shown above the input (STORY-33): the shared
  // agent was busy with another turn, or it restarted. Never disables input —
  // cleared when the user sends their next prompt.
  const [notice, setNotice] = useState<string | null>(null);
  // True while the agent is streaming a `text` run; reset by any non-text event
  // so the next text-chunk starts a fresh message.
  const streamingRef = useRef(false);
  const idRef = useRef(0);
  const nextId = useCallback(() => `m${(idRef.current += 1)}`, []);
  // The project's persisted transcript is replayed once on join (STORY-37); guard
  // against applying a second chat_history frame (e.g. on reconnect).
  const historyLoadedRef = useRef(false);

  // Fallback author for agent attribution. The orchestrator now tags each
  // agent_event / user_prompt frame with the prompting user (STORY-32), so this
  // is only used if a frame ever arrives without one (older server).
  const authorRef = useRef(currentUser);
  authorRef.current = currentUser;

  // An app-level error frame surfaces as an error state without tearing down the
  // shared connection (mirrors STORY-09's behaviour on the dedicated socket).
  const status = errored ? 'error' : socketStatus;

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const appendAgentText = useCallback(
    (chunk: string, author: ChatAuthor) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (streamingRef.current && last && last.kind === 'text') {
          return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
        }
        streamingRef.current = true;
        return [...prev, { id: nextId(), kind: 'text', author, text: chunk }];
      });
    },
    [nextId],
  );

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      if (frame.type === 'chat_history') {
        // The project's full transcript, replayed on join (STORY-37). Apply once;
        // prepend it so any live frame that arrived first stays after it, in order.
        if (historyLoadedRef.current) return;
        historyLoadedRef.current = true;
        streamingRef.current = false;
        const history = Array.isArray(frame.messages) ? (frame.messages as ChatMessage[]) : [];
        if (history.length > 0) setMessages((prev) => [...history, ...prev]);
        return;
      }
      if (frame.type === 'agent_event') {
        const event = frame.event as Record<string, unknown> | undefined;
        // The orchestrator stamps each frame with the prompting user (STORY-32),
        // so an agent stream a peer triggered is attributed to them, not to me.
        const author = (frame.author as ChatAuthor | undefined) ?? authorRef.current;
        switch (event?.type) {
          case 'text-chunk':
            appendAgentText(typeof event.text === 'string' ? event.text : '', author);
            return;
          case 'tool-call':
            streamingRef.current = false;
            pushMessage({
              id: nextId(),
              kind: 'tool_call',
              author,
              title: typeof event.title === 'string' ? event.title : 'tool',
            });
            return;
          case 'file-change':
            streamingRef.current = false;
            pushMessage({
              id: nextId(),
              kind: 'file_change',
              author,
              change: typeof event.change === 'string' ? event.change : 'modify',
              path: typeof event.path === 'string' ? event.path : '',
            });
            return;
          case 'error':
            streamingRef.current = false;
            pushMessage({
              id: nextId(),
              kind: 'error',
              author,
              text: typeof event.message === 'string' ? event.message : 'Agent error',
            });
            return;
          case 'turn-complete':
            streamingRef.current = false;
            return;
        }
      } else if (frame.type === 'user_prompt') {
        // A peer's prompt (STORY-32). The orchestrator echoes it to everyone but
        // the sender, who already renders it optimistically in sendPrompt.
        streamingRef.current = false;
        pushMessage({
          id: nextId(),
          kind: 'user',
          author: (frame.author as ChatAuthor | undefined) ?? authorRef.current,
          text: typeof frame.text === 'string' ? frame.text : '',
        });
      } else if (frame.type === 'agent_busy') {
        // The shared agent is mid-turn, so this prompt wasn't run (STORY-33).
        // Surface a transient notice; the input stays live so they can retry.
        setNotice(
          'The agent is finishing another turn — your message wasn’t sent. Try again in a moment.',
        );
      } else if (frame.type === 'agent_restarted') {
        // The agent process was re-opened after dying — files persist, but the
        // earlier conversation context is gone.
        streamingRef.current = false;
        setNotice(
          'The agent restarted — your files are intact, but earlier chat context was reset.',
        );
      } else if (frame.type === 'error' && frame.path === undefined) {
        // Only session-scoped errors (no `path`) touch the chat. File read/save
        // errors carry a `path` and are surfaced in the editor instead, so a
        // failed save never poisons the chat or disables the input (TASK-071).
        streamingRef.current = false;
        setErrored(true);
        pushMessage({
          id: nextId(),
          kind: 'error',
          author: authorRef.current,
          text: 'Session error',
        });
      }
    });
  }, [subscribe, appendAgentText, pushMessage, nextId]);

  function sendPrompt(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (!send({ type: 'prompt', text })) return;
    streamingRef.current = false;
    setNotice(null);
    pushMessage({ id: nextId(), kind: 'user', author: currentUser, text });
    setInput('');
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {status === 'idle' || status === 'connecting' ? (
        <Button
          onClick={() => {
            setErrored(false);
            start();
          }}
          disabled={status === 'connecting'}
        >
          {status === 'connecting' ? 'Starting…' : 'Start session'}
        </Button>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {status === 'connected' ? 'Session connected' : 'Session error'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              // End the session, then leave the workspace for the dashboard —
              // staying would just show the readiness overlay with nothing to
              // connect to.
              close();
              setErrored(false);
              router.push('/dashboard');
            }}
          >
            End session
          </Button>
        </div>
      )}

      <ChatTranscript messages={messages} />

      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      <form onSubmit={sendPrompt} className="flex items-center gap-2">
        <Monogram variant="ink" name={currentUser.name} />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the assistant…"
          disabled={status !== 'connected'}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={status !== 'connected' || input.trim().length === 0}>
          Send
        </Button>
      </form>
    </div>
  );
}
