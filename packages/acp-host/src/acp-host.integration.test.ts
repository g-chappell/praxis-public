import { randomBytes } from 'node:crypto';

import { DockerSandbox } from '@praxis/sandbox';
import type { SandboxHandle } from '@praxis/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClaudeAcpHost } from './acp-host.js';
import type { AcpEvent } from './events.js';

// End-to-end prompt round-trip against a REAL DockerSandbox running the
// claude-agent-acp adapter on a real Anthropic API key (ADR-0009). Two gates:
//   RUN_DOCKER_TESTS=1   — a Docker daemon is available (as in @praxis/sandbox)
//   ANTHROPIC_API_KEY    — a live key; the consent flow can't run in CI, and a
//                          subscription token must never be used here
// CI runs neither by default — determinism comes from the recorded-agent unit
// tests in acp-host.test.ts; this is the live signal, run locally / nightly.
// Requires the base image to ship `claude-agent-acp` (operator follow-up).
const API_KEY = process.env.ANTHROPIC_API_KEY;
const RUN = process.env.RUN_DOCKER_TESTS === '1' && !!API_KEY;

if (process.env.RUN_DOCKER_TESTS === '1' && !API_KEY) {
  console.warn('[acp-host] skipping live ACP round-trip: ANTHROPIC_API_KEY is not set');
}

const describeLive = RUN ? describe : describe.skip;
const TURN_TIMEOUT = 30_000;

describeLive('ClaudeAcpHost round-trip (real sandbox + agent)', () => {
  const sandbox = new DockerSandbox();
  const host = new ClaudeAcpHost();
  const projectId = `acp-test-${randomBytes(6).toString('hex')}`;
  let handle: SandboxHandle;

  beforeAll(async () => {
    handle = await sandbox.start(projectId, 'react-threejs-scene');
  }, TURN_TIMEOUT);

  afterAll(async () => {
    try {
      await sandbox.stop(handle);
    } catch {
      /* ignore */
    }
  }, TURN_TIMEOUT);

  it(
    'streams a text response and completes the turn, then continues on the same session',
    async () => {
      const session = await host.openAgent(sandbox, handle, API_KEY!);
      try {
        const turn = async (text: string): Promise<AcpEvent[]> => {
          const events: AcpEvent[] = [];
          for await (const event of session.prompt(text, { onPermission: async () => 'allow' })) {
            events.push(event);
          }
          return events;
        };

        const first = await turn('Remember the word "pong". Reply with exactly: pong');
        const firstErrors = first.filter((e) => e.type === 'error');
        expect(firstErrors, JSON.stringify(firstErrors)).toHaveLength(0);
        expect(first.some((e) => e.type === 'text-chunk' && e.text.length > 0)).toBe(true);
        expect(first.at(-1)?.type).toBe('turn-complete');

        // Same persistent session — the agent should recall the prior turn.
        const second = await turn(
          'What word did I ask you to remember? Reply with just that word.',
        );
        expect(second.filter((e) => e.type === 'error')).toHaveLength(0);
        expect(second.some((e) => e.type === 'text-chunk' && /pong/i.test(e.text))).toBe(true);
        expect(second.at(-1)?.type).toBe('turn-complete');
      } finally {
        await session.close();
      }
    },
    TURN_TIMEOUT * 2,
  );

  it(
    'resumes a prior conversation across a process teardown via session/load (STORY-36)',
    async () => {
      const drain = async (s: Awaited<ReturnType<typeof host.openAgent>>, text: string) => {
        const events: AcpEvent[] = [];
        for await (const event of s.prompt(text, { onPermission: async () => 'allow' })) {
          events.push(event);
        }
        return events;
      };

      // Session 1: tell the agent a fact, capture its id, then kill the process.
      const s1 = await host.openAgent(sandbox, handle, API_KEY!);
      await drain(s1, 'Remember the word "marmalade". Reply with exactly: marmalade');
      const priorId = s1.sessionId;
      await s1.close(); // kills the agent process; the store persists on the volume

      // Session 2: a brand-new process, resuming the prior session by id. The
      // store lives under HOME=/workspace/.praxis-agent (persisted), so loadSession
      // restores the conversation.
      const s2 = await host.openAgent(sandbox, handle, API_KEY!, { resumeSessionId: priorId });
      try {
        expect(s2.resumed).toBe(true);
        const recall = await drain(
          s2,
          'What word did I ask you to remember? Reply with just that word.',
        );
        expect(recall.filter((e) => e.type === 'error')).toHaveLength(0);
        expect(recall.some((e) => e.type === 'text-chunk' && /marmalade/i.test(e.text))).toBe(true);
      } finally {
        await s2.close();
      }
    },
    TURN_TIMEOUT * 2,
  );
});
