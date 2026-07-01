import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { Agent, RequestPermissionOutcome } from '@agentclientprotocol/sdk';
import type { ProcessHandle, Sandbox, SandboxHandle } from '@praxis/sandbox';
import { describe, expect, it, vi } from 'vitest';

import { AgentBusyError, ClaudeAcpHost } from './acp-host.js';
import type { AcpEvent, PermissionRequest } from './events.js';

const HANDLE: SandboxHandle = { projectId: 'p1', containerId: 'c1' };
const SESSION = 'session-1';

// Wire the host and a real ACP agent (AgentSideConnection) together over two
// in-memory byte pipes, fronted by a fake Sandbox/ProcessHandle. This exercises
// the real ACP protocol on both sides — only the agent's logic is a fixture, so
// we never mock ACP itself (AGENTS.md testing patterns).
function harness(toAgent: (conn: AgentSideConnection) => Agent): {
  sandbox: Sandbox;
  spawn: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
} {
  const hostToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToHost = new TransformStream<Uint8Array, Uint8Array>();
  const hostWriter = hostToAgent.writable.getWriter();
  const encoder = new TextEncoder();

  const kill = vi.fn(async () => {
    await hostWriter.close().catch(() => {});
  });
  const proc: ProcessHandle = {
    pid: 4242,
    stdout: readStrings(agentToHost.readable),
    stderr: (async function* () {})(),
    write: async (data: string) => {
      await hostWriter.write(encoder.encode(data));
    },
    kill,
    wait: async () => 0,
  };

  // The agent side speaks ACP over the opposite ends of the two pipes.
  new AgentSideConnection(toAgent, ndJsonStream(agentToHost.writable, hostToAgent.readable));

  const spawn = vi.fn(async () => proc);
  const sandbox = { spawn } as unknown as Sandbox;
  return { sandbox, spawn, kill };
}

// Build an Agent fixture with `prompt` (and optionally other handlers); the
// boilerplate ACP methods get inert defaults so each test states only what it
// exercises.
function makeAgent(
  promptFor: (conn: AgentSideConnection) => Agent['prompt'],
): (conn: AgentSideConnection) => Agent {
  return (conn) => ({
    async initialize() {
      return { protocolVersion: PROTOCOL_VERSION };
    },
    async newSession() {
      return { sessionId: SESSION };
    },
    async authenticate() {
      return {};
    },
    async cancel() {},
    prompt: promptFor(conn),
  });
}

async function* readStrings(readable: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function collect(events: AsyncIterable<AcpEvent>): Promise<AcpEvent[]> {
  const out: AcpEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

async function waitFor(pred: () => boolean, ms = 1000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const allow = async (): Promise<'allow'> => 'allow';

describe('ClaudeAcpHost — persistent AgentSession (ADR-0016)', () => {
  it('streams text chunks and completes the turn (happy path)', async () => {
    const { sandbox, spawn } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'hello ' },
          },
        });
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'world' },
          },
        });
        return {
          stopReason: 'end_turn',
          usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
        };
      }),
    );

    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');
    const events = await collect(session.prompt('hi', { onPermission: allow }));

    expect(events).toEqual([
      { type: 'text-chunk', text: 'hello ' },
      { type: 'text-chunk', text: 'world' },
      {
        type: 'turn-complete',
        stopReason: 'end_turn',
        usage: { inputTokens: 12, outputTokens: 5 },
      },
    ]);

    // Authenticates with the platform API key and nothing else (ADR-0009).
    const [, command, opts] = spawn.mock.calls[0]!;
    expect(command).toBe('claude-agent-acp');
    // Platform key + the relocated HOME so the agent store persists (ADR-0017).
    expect(opts?.env).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      HOME: '/workspace/.praxis-agent',
    });
    await session.close();
  });

  it('spawns the agent with ONLY the platform key — no per-user OAuth token (ADR-0009/STORY-24)', async () => {
    const { sandbox, spawn } = harness(makeAgent(() => async () => ({ stopReason: 'end_turn' })));
    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-platform');

    const env = (spawn.mock.calls[0]![2] as { env?: Record<string, string> }).env ?? {};
    // The platform key is the sole inference credential.
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-platform');
    // No subscription-OAuth fallback may reach the agent — neither the explicit
    // adapter var nor any other token-shaped key.
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(Object.keys(env).some((k) => /oauth|token/i.test(k))).toBe(false);

    await session.close();
  });

  it('reuses one process + ACP session across turns, with continuity', async () => {
    let turns = 0;
    const { sandbox, spawn, kill } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        turns += 1;
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: `turn ${turns}` },
          },
        });
        return { stopReason: 'end_turn' };
      }),
    );

    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');
    const first = await collect(session.prompt('one', { onPermission: allow }));
    const second = await collect(session.prompt('two', { onPermission: allow }));

    // One process drove both turns; the per-turn counter advancing proves the
    // same long-lived agent session handled the second prompt (continuity).
    expect(spawn).toHaveBeenCalledOnce();
    expect(first).toContainEqual({ type: 'text-chunk', text: 'turn 1' });
    expect(second).toContainEqual({ type: 'text-chunk', text: 'turn 2' });
    // Stays alive between turns; only close() kills it.
    expect(kill).not.toHaveBeenCalled();
    expect(session.alive).toBe(true);

    await session.close();
    expect(kill).toHaveBeenCalledOnce();
    expect(session.alive).toBe(false);
  });

  it('serialises turns — a prompt while one is in flight is rejected as busy', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { sandbox } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'working' },
          },
        });
        await gate; // hold the turn open
        return { stopReason: 'end_turn' };
      }),
    );

    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');

    // Start the first turn and let it begin (busy=true) without finishing.
    const first = collect(session.prompt('one', { onPermission: allow }));
    await waitFor(() => session.busy);

    // A second prompt while busy is rejected, not raced.
    await expect(collect(session.prompt('two', { onPermission: allow }))).rejects.toBeInstanceOf(
      AgentBusyError,
    );

    release();
    await first;
    expect(session.busy).toBe(false);
    await session.close();
  });

  it('surfaces a tool-permission request and proceeds when allowed', async () => {
    let outcome: RequestPermissionOutcome | undefined;
    const { sandbox } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        const response = await conn.requestPermission({
          sessionId,
          options: [
            { optionId: 'a', name: 'Allow', kind: 'allow_once' },
            { optionId: 'd', name: 'Deny', kind: 'reject_once' },
          ],
          toolCall: { toolCallId: 'tool-1', title: 'Write file', rawInput: { path: 'a.txt' } },
        });
        outcome = response.outcome;
        if (response.outcome.outcome === 'selected' && response.outcome.optionId === 'a') {
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-1',
              title: 'Write file',
              rawInput: { path: 'a.txt' },
            },
          });
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: 'tool-1',
              status: 'completed',
              rawOutput: { ok: true },
            },
          });
        }
        return { stopReason: 'end_turn' };
      }),
    );

    const seen: PermissionRequest[] = [];
    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');
    const events = await collect(
      session.prompt('write a.txt', {
        onPermission: async (request) => {
          seen.push(request);
          return 'allow';
        },
      }),
    );

    expect(seen).toEqual([{ toolCallId: 'tool-1', title: 'Write file', input: { path: 'a.txt' } }]);
    expect(outcome).toEqual({ outcome: 'selected', optionId: 'a' });
    expect(events).toEqual([
      { type: 'tool-call', toolCallId: 'tool-1', title: 'Write file', input: { path: 'a.txt' } },
      { type: 'tool-result', toolCallId: 'tool-1', isError: false, output: { ok: true } },
      { type: 'turn-complete', stopReason: 'end_turn', usage: null },
    ]);
    await session.close();
  });

  it('rejects the tool and completes cleanly when denied', async () => {
    let outcome: RequestPermissionOutcome | undefined;
    const { sandbox } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        const response = await conn.requestPermission({
          sessionId,
          options: [
            { optionId: 'a', name: 'Allow', kind: 'allow_once' },
            { optionId: 'd', name: 'Deny', kind: 'reject_once' },
          ],
          toolCall: { toolCallId: 'tool-1', title: 'Delete repo', rawInput: { path: '/' } },
        });
        outcome = response.outcome;
        return { stopReason: 'end_turn' };
      }),
    );

    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');
    const events = await collect(
      session.prompt('delete everything', { onPermission: async () => 'deny' }),
    );

    expect(outcome).toEqual({ outcome: 'selected', optionId: 'd' });
    expect(events.some((e) => e.type === 'tool-result')).toBe(false);
    expect(events).toContainEqual({ type: 'turn-complete', stopReason: 'end_turn', usage: null });
    await session.close();
  });

  it('close() is idempotent and marks the session not alive', async () => {
    const { sandbox, kill } = harness(makeAgent(() => async () => ({ stopReason: 'end_turn' })));
    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');
    await collect(session.prompt('noop', { onPermission: allow }));

    await session.close();
    await session.close();
    expect(session.alive).toBe(false);
    expect(kill).toHaveBeenCalled();
  });

  it('resumes a prior conversation via loadSession when the agent advertises it (ADR-0017)', async () => {
    let loadedWith: string | undefined;
    const { sandbox } = harness(() => ({
      async initialize() {
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } };
      },
      async newSession() {
        return { sessionId: 'fresh' };
      },
      async loadSession({ sessionId }) {
        loadedWith = sessionId;
        return {};
      },
      async authenticate() {
        return {};
      },
      async cancel() {},
      prompt: async () => ({ stopReason: 'end_turn' }),
    }));

    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test', {
      resumeSessionId: 'prior-123',
    });
    expect(loadedWith).toBe('prior-123');
    expect(session.resumed).toBe(true);
    expect(session.sessionId).toBe('prior-123');
    await session.close();
  });

  it('falls back to a fresh session when loadSession fails (resumed=false)', async () => {
    const { sandbox } = harness(() => ({
      async initialize() {
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } };
      },
      async newSession() {
        return { sessionId: 'fresh-after-fail' };
      },
      async loadSession() {
        throw new Error('no such session');
      },
      async authenticate() {
        return {};
      },
      async cancel() {},
      prompt: async () => ({ stopReason: 'end_turn' }),
    }));

    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test', {
      resumeSessionId: 'gone',
    });
    expect(session.resumed).toBe(false);
    expect(session.sessionId).toBe('fresh-after-fail');
    await session.close();
  });

  it('creates a fresh session and exposes its id when no resume is requested', async () => {
    const { sandbox } = harness(makeAgent(() => async () => ({ stopReason: 'end_turn' })));
    const host = new ClaudeAcpHost();
    const session = await host.openAgent(sandbox, HANDLE, 'sk-ant-test');
    expect(session.resumed).toBe(false);
    expect(session.sessionId).toBe(SESSION);
    await session.close();
  });
});
