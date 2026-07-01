// Unit tests for the chat-history row→message mapping (STORY-37). Pure, no DB —
// the persist/load round-trip against Postgres is verified live (history shows on
// rejoin) per the deploy-layer-live convention; this pins the rendering contract
// so replayed history maps to the same ChatMessage kinds the chat panel renders.

import { describe, expect, it } from 'vitest';

import { mapChatRows } from '../src/chat-history';

const ada = { name: 'Ada', image: null };

describe('mapChatRows (STORY-37)', () => {
  it('maps each persisted event_type to its chat-message kind, spreading author + content', () => {
    const messages = mapChatRows([
      { id: 'e1', eventType: 'user_prompt', payload: { author: ada, text: 'add a cube' } },
      { id: 'e2', eventType: 'agent_text', payload: { author: ada, text: 'on it' } },
      { id: 'e3', eventType: 'tool_call', payload: { author: ada, title: 'Write file' } },
      {
        id: 'e4',
        eventType: 'file_change',
        payload: { author: ada, change: 'modify', path: 'a.ts' },
      },
      { id: 'e5', eventType: 'agent_error', payload: { author: ada, text: 'boom' } },
    ]);

    expect(messages).toEqual([
      { id: 'e1', kind: 'user', author: ada, text: 'add a cube' },
      { id: 'e2', kind: 'text', author: ada, text: 'on it' },
      { id: 'e3', kind: 'tool_call', author: ada, title: 'Write file' },
      { id: 'e4', kind: 'file_change', author: ada, change: 'modify', path: 'a.ts' },
      { id: 'e5', kind: 'error', author: ada, text: 'boom' },
    ]);
  });

  it('preserves row order (caller orders by created_at)', () => {
    const ids = mapChatRows([
      { id: 'a', eventType: 'user_prompt', payload: { author: ada, text: '1' } },
      { id: 'b', eventType: 'agent_text', payload: { author: ada, text: '2' } },
      { id: 'c', eventType: 'user_prompt', payload: { author: ada, text: '3' } },
    ]).map((m) => m.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('falls back to text for an unknown kind and tolerates a null payload', () => {
    expect(
      mapChatRows([{ id: 'x', eventType: 'mystery', payload: { text: 'q' } }])[0],
    ).toMatchObject({
      id: 'x',
      kind: 'text',
      text: 'q',
    });
    expect(mapChatRows([{ id: 'n', eventType: 'agent_text', payload: null }])[0]).toEqual({
      id: 'n',
      kind: 'text',
    });
  });
});
