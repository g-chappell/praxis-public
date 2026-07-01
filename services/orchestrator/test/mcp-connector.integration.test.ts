// Acceptance proof for STORY-50/TASK-150 (ADR-0020). Gated by RUN_DOCKER_TESTS=1.
// Seeds a registry connector into a REAL sandbox and asserts the agent would see
// it: the project's .mcp.json contains the connector entry AND its baked wrapper
// command resolves on PATH inside the container. Uses command_ref 'image-gen'
// (wrapper 'praxis-mcp-image-gen' is baked into sandbox-base), so no new image is
// needed to prove rendering + reachability.

import { randomBytes } from 'node:crypto';

import { DockerSandbox, type SandboxHandle } from '@praxis/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { EnabledConnector } from '../src/mcp-registry';
import { seedRegistryConnectors } from '../src/mcp-seed';

const RUN = process.env.RUN_DOCKER_TESTS === '1';
const describeDocker = RUN ? describe : describe.skip;
const T = 60_000;

describeDocker('registry connector reaches the sandbox (real Docker)', () => {
  const sandbox = new DockerSandbox();
  const projectId = `conn-${randomBytes(5).toString('hex')}`;
  let handle: SandboxHandle;

  beforeAll(async () => {
    handle = await sandbox.start(projectId, 'blank');
  }, T);

  afterAll(async () => {
    try {
      await sandbox.destroy(projectId);
    } catch {
      /* ignore */
    }
  }, T);

  it(
    'renders .mcp.json + the wrapper command resolves on PATH',
    async () => {
      const connector: EnabledConnector = {
        name: 'image-gen',
        command: 'praxis-mcp-image-gen',
        args: [],
        allowedCommands: ['generate_image'],
        usageCap: null,
      };
      const n = await seedRegistryConnectors(
        sandbox,
        handle,
        [connector],
        { 'image-gen': 'sk-x' },
        {
          usageUrl: 'http://orch/usage',
          usageToken: 'tok',
        },
      );
      expect(n).toBe(1);

      // .mcp.json is present in /workspace and references the connector.
      const mcp = JSON.parse(await sandbox.readFile(handle, '.mcp.json'));
      expect(mcp.mcpServers['image-gen'].command).toBe('praxis-mcp-image-gen');

      // The wrapper resolves on PATH inside the sandbox (server reachable).
      const which = await sandbox.exec(handle, 'which praxis-mcp-image-gen');
      expect(which.exitCode).toBe(0);
      expect(which.stdout.trim().length).toBeGreaterThan(0);
    },
    T,
  );
});
