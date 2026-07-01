// Persistent chat history (STORY-37). The orchestrator broadcasts chat frames
// live (STORY-32); this also persists them to the `events` table per project so a
// late joiner / re-opener gets the full transcript replayed on connect. Kept out
// of ws.ts (which is Bun-coupled via hono/bun) so it's importable in Node tests.

import { asc, eq } from 'drizzle-orm';

import { events } from '@praxis/db';
import { db } from '@praxis/db/client';

import { logger } from './logger';

/** Persisted chat-message kinds (events.event_type). Mirror the chat panel's
 *  ChatMessage kinds so replayed history renders identically to live messages. */
export type ChatEventType =
  | 'user_prompt'
  | 'agent_text'
  | 'tool_call'
  | 'file_change'
  | 'agent_error';

/** event_type → the chat panel's ChatMessage `kind`. */
const CHAT_KIND: Record<ChatEventType, string> = {
  user_prompt: 'user',
  agent_text: 'text',
  tool_call: 'tool_call',
  file_change: 'file_change',
  agent_error: 'error',
};

/** A persisted chat row as loaded for replay. */
export interface ChatRow {
  id: string;
  eventType: string;
  payload: unknown;
}

/** Map persisted rows to the chat-history message frames the client renders. Pure
 *  (no DB) so the rendering contract is unit-testable. The payload already holds
 *  `author` + the kind-specific fields (text / title / change / path). */
export function mapChatRows(rows: ChatRow[]): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    id: r.id,
    kind: CHAT_KIND[r.eventType as ChatEventType] ?? 'text',
    ...((r.payload ?? {}) as Record<string, unknown>),
  }));
}

/** Persist one chat message to a project's transcript. Keyed by projectId so
 *  history spans all of a project's sessions; callers await these in sequence so
 *  created_at ordering matches the conversation. Best-effort: a failed write loses
 *  that message from history but never breaks the live turn. */
export async function persistChatEvent(
  projectId: string,
  sessionId: string,
  userId: string,
  eventType: ChatEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(events).values({ projectId, sessionId, userId, eventType, payload });
  } catch (err) {
    logger.warn(
      { projectId, eventType, err: err instanceof Error ? err.message : String(err) },
      'chat.persist_failed',
    );
  }
}

/** Load a project's full chat transcript as ordered message frames for replay on
 *  join. Best-effort: returns [] on error so a join is never blocked by history. */
export async function loadChatHistory(projectId: string): Promise<Array<Record<string, unknown>>> {
  try {
    const rows = await db
      .select({ id: events.id, eventType: events.eventType, payload: events.payload })
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(asc(events.createdAt));
    return mapChatRows(rows);
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'chat.history_failed',
    );
    return [];
  }
}
