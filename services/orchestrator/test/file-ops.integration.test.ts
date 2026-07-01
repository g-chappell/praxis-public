// Acceptance proof for TASK-031 — "edit-save-refresh preserves content" — run
// against a REAL Docker sandbox. Gated by RUN_DOCKER_TESTS=1 (like
// packages/sandbox/src/docker-sandbox.test.ts) so CI without Docker still passes.
// Exercises the actual file-ops handlers, not mocks: save → read → restart the
// sandbox (the "refresh") → read again and assert the edit survived.

import { randomBytes } from 'node:crypto';

import { DockerSandbox, type SandboxHandle } from '@praxis/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleFileList, handleFileRead, handleFileSave } from '../src/file-ops';

const RUN = process.env.RUN_DOCKER_TESTS === '1';
const describeDocker = RUN ? describe : describe.skip;
const T = 120_000;

function collector() {
  const sent: Array<Record<string, unknown>> = [];
  return { sent, send: (p: unknown) => void sent.push(p as Record<string, unknown>) };
}

describeDocker('file-ops over a real sandbox (edit-save-refresh)', () => {
  const sandbox = new DockerSandbox();
  const projectId = `test-${randomBytes(6).toString('hex')}`;
  let handle: SandboxHandle;

  beforeAll(async () => {
    handle = await sandbox.start(projectId, 'react-threejs-scene');
  }, T);

  afterAll(async () => {
    try {
      await sandbox.stop(handle);
    } catch {
      /* ignore */
    }
  }, T);

  it(
    'save → read round-trips, lists, and survives a sandbox restart',
    async () => {
      const path = 'src/edited.txt';
      const body = 'edit-save-refresh\n';

      // Save.
      const saved = collector();
      await handleFileSave(saved.send, sandbox, handle, path, body);
      expect(saved.sent).toEqual([{ type: 'file_saved', path }]);

      // Read it back over the same handle.
      const read = collector();
      await handleFileRead(read.send, sandbox, handle, path);
      expect(read.sent).toEqual([{ type: 'file_contents', path, content: body }]);

      // The tree includes the new (untracked-but-not-ignored) file.
      const listed = collector();
      await handleFileList(listed.send, sandbox, handle);
      expect((listed.sent[0]!.paths as string[]) ?? []).toContain(path);

      // "Refresh": stop and restart the sandbox for the same project. The named
      // volume persists, so the file must still be there.
      await sandbox.stop(handle);
      handle = await sandbox.start(projectId, 'react-threejs-scene');

      const afterRefresh = collector();
      await handleFileRead(afterRefresh.send, sandbox, handle, path);
      expect(afterRefresh.sent).toEqual([{ type: 'file_contents', path, content: body }]);
    },
    T,
  );
});
