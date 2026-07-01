import { randomBytes } from 'node:crypto';

import Docker from 'dockerode';
import { afterAll, describe, expect, it } from 'vitest';

import { DockerSandbox } from './docker-sandbox.js';
import { IdleSweeper } from './idle-sweeper.js';
import { InMemoryObjectStore } from './object-store.js';
import type { SandboxHandle } from './index.js';

// Integration — real Docker, stubbed object store (per STORY-07 AC). Gated.
const RUN = process.env.RUN_DOCKER_TESTS === '1';
const describeDocker = RUN ? describe : describe.skip;
const T = 90_000;

describeDocker('DockerSandbox persistence + idle sweep', () => {
  const store = new InMemoryObjectStore();
  const sandbox = new DockerSandbox({ store });
  const docker = new Docker();
  const projectId = `ptest-${randomBytes(6).toString('hex')}`;
  let handle: SandboxHandle | undefined;

  afterAll(async () => {
    try {
      if (handle) await sandbox.stop(handle);
    } catch {
      /* ignore */
    }
    try {
      await docker.getVolume(`praxis-project-${projectId}`).remove({ force: true });
    } catch {
      /* ignore */
    }
  }, T);

  it(
    'write → force-idle stop (snapshot) → volume lost → restart restores the file',
    async () => {
      handle = await sandbox.start(projectId, 'react-threejs-scene');
      await sandbox.writeFile(handle, 'keep.txt', 'persisted');

      const sweeper = new IdleSweeper(sandbox, { idleMs: 1000 });

      // Recently active → not swept.
      await sandbox.exec(handle, 'true');
      expect(await sweeper.sweep(Date.now())).not.toContain(projectId);

      // Force idle by advancing the sweep clock past the threshold.
      const stopped = await sweeper.sweep(Date.now() + 60 * 60 * 1000);
      expect(stopped).toContain(projectId);

      // Container is gone and a snapshot was written on the way down.
      const running = await docker.listContainers({
        all: true,
        filters: { name: [`praxis-sandbox-${projectId}`] },
      });
      expect(running.length).toBe(0);
      expect(await store.hasSnapshot(projectId)).toBe(true);

      // Simulate the local volume also being reclaimed, so the next start MUST
      // restore from the object store.
      await docker.getVolume(`praxis-project-${projectId}`).remove({ force: true });

      handle = await sandbox.start(projectId, 'react-threejs-scene');
      expect(await sandbox.readFile(handle, 'keep.txt')).toBe('persisted');
    },
    T,
  );
});
