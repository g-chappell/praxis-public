import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DockerSandbox } from './docker-sandbox.js';
import type { SandboxHandle } from './index.js';

// Integration — real Docker (gated by RUN_DOCKER_TESTS=1). Proves STORY-19's
// egress allowlist end-to-end: a sandbox on an internal network can reach an
// allowlisted host through the proxy but not a disallowed one, and has no route
// out without the proxy. Builds + runs the praxis-egress proxy on a throwaway
// internal network, then drives a real sandbox.
//   RUN_DOCKER_TESTS=1 pnpm exec vitest run --root . packages/sandbox/src/egress.integration
const RUN = process.env.RUN_DOCKER_TESTS === '1';
const describeDocker = RUN ? describe : describe.skip;
const T = 180_000;

const SUFFIX = randomBytes(4).toString('hex');
const NET = `praxis-egress-it-${SUFFIX}`;
const PROXY = `praxis-egress-it-${SUFFIX}`;
const IMAGE = `praxis-egress-it:${SUFFIX}`;
const PROXY_CTX = resolve(process.cwd(), 'infrastructure/docker/egress-proxy');

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}
function tryDocker(...args: string[]): void {
  try {
    docker(...args);
  } catch {
    /* best-effort teardown */
  }
}

describeDocker('DockerSandbox egress allowlist (real Docker)', () => {
  const projectId = `egress-${SUFFIX}`;
  const sandbox = new DockerSandbox({
    network: NET,
    egress: { proxyUrl: `http://${PROXY}:3128` },
  });
  let handle: SandboxHandle | undefined;

  afterAll(async () => {
    try {
      if (handle) await sandbox.stop(handle);
    } catch {
      /* ignore */
    }
    tryDocker('rm', '-f', PROXY);
    tryDocker('network', 'rm', NET);
    tryDocker('rmi', IMAGE);
    tryDocker('volume', 'rm', '-f', `praxis-project-${projectId}`);
  }, T);

  it(
    'allows an allowlisted host, blocks others, and has no route without the proxy',
    async () => {
      // Stand up the proxy on an internal network bridged to the outside.
      docker('build', '-t', IMAGE, PROXY_CTX);
      docker('network', 'create', '--internal', NET);
      docker('run', '-d', '--name', PROXY, '--network', NET, IMAGE);
      docker('network', 'connect', 'bridge', PROXY);

      handle = await sandbox.start(projectId, 'react-threejs-scene');

      // Allowlisted host → reachable through the proxy (HTTP 200).
      const allowed = await sandbox.exec(
        handle,
        'curl -s -o /dev/null -w "%{http_code}" --max-time 25 https://registry.npmjs.org/',
        { timeoutMs: 30_000 },
      );
      expect(allowed.stdout.trim()).toBe('200');

      // Disallowed host → the proxy refuses the CONNECT tunnel (curl exit 56).
      const blocked = await sandbox.exec(
        handle,
        'curl -s -o /dev/null --max-time 25 https://example.com/; echo "exit=$?"',
        { timeoutMs: 30_000 },
      );
      expect(blocked.stdout).toContain('exit=56');

      // No proxy → no route out at all (DNS can't resolve on the internal net).
      const direct = await sandbox.exec(
        handle,
        'env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy ' +
          'curl -s -o /dev/null --max-time 10 https://registry.npmjs.org/; echo "exit=$?"',
        { timeoutMs: 20_000 },
      );
      expect(direct.stdout).not.toContain('exit=0');
    },
    T,
  );
});
