// Acceptance proof for preview routing. Gated by RUN_DOCKER_TESTS=1. Runs a tiny
// HTTP server inside a real sandbox, registers it, and drives the orchestrator's
// own app.fetch with a preview Host — proving expose → URL serves content →
// revoke → 404.

import { randomBytes } from 'node:crypto';

import { DockerSandbox, type ProcessHandle, type SandboxHandle } from '@praxis/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { registerPreview, removePreview } from '../src/preview';

const RUN = process.env.RUN_DOCKER_TESTS === '1';
const describeDocker = RUN ? describe : describe.skip;
const T = 60_000;
const DOMAIN = 'preview.test.local';
const PORT = 8088;

describeDocker('preview proxy (real sandbox)', () => {
  const sandbox = new DockerSandbox();
  const projectId = `prev-${randomBytes(5).toString('hex')}`;
  let handle: SandboxHandle;
  let server: ProcessHandle | undefined;

  const previewReq = () => new Request(`http://${projectId}.${DOMAIN}/`);

  beforeAll(async () => {
    process.env.PREVIEW_DOMAIN = DOMAIN;
    handle = await sandbox.start(projectId, 'blank');
    await sandbox.writeFile(handle, 'index.html', '<h1>hello from sandbox</h1>');
    server = await sandbox.spawn(handle, `python3 -m http.server ${PORT} --directory /workspace`);
    const addr = await sandbox.exposePort(handle, PORT);
    registerPreview(projectId, {
      ip: new URL(addr).hostname,
      port: PORT,
      containerId: handle.containerId,
    });
  }, T);

  afterAll(async () => {
    try {
      await server?.kill();
    } catch {
      /* ignore */
    }
    removePreview(projectId);
    try {
      await sandbox.destroy(projectId); // container + volume
    } catch {
      /* ignore */
    }
  }, T);

  it(
    'serves the sandbox via the preview Host, then 404s after revoke',
    async () => {
      // Poll the proxy until the python server is listening.
      let body = '';
      for (let i = 0; i < 25; i += 1) {
        const res = await app.fetch(previewReq());
        if (res.status === 200) {
          body = await res.text();
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      expect(body).toContain('hello from sandbox');

      // Revoke (what session-end does) → the proxy 404s.
      removePreview(projectId);
      expect((await app.fetch(previewReq())).status).toBe(404);
    },
    T,
  );
});
