// DockerSandbox — the POC `Sandbox` implementation (ADR-0007), backed by a
// per-project Docker container created from `praxis-sandbox-base`. Nothing
// outside this file imports dockerode; consumers use the `Sandbox` interface.

import { type ChildProcessWithoutNullStreams, spawn as spawnProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import * as posix from 'node:path/posix';
import { PassThrough, Readable } from 'node:stream';

import Docker from 'dockerode';
import * as tar from 'tar-stream';

// dockerode handles the container/volume/archive lifecycle (plain HTTP). For
// exec'ing into containers we shell out to the `docker` CLI instead: dockerode's
// hijacked exec stream (HTTP 101 upgrade) doesn't work under Bun, whereas the CLI
// attaches stdio natively and runs identically under Bun (prod) and Node (tests).
const DOCKER_CLI = 'docker';

import type {
  ExecOptions,
  ExecResult,
  FileEvent,
  FileEventType,
  ProcessHandle,
  Sandbox,
  SandboxHandle,
  SpawnOptions,
  Unsubscribe,
} from './index.js';
import type { ObjectStore } from './object-store.js';

const WORKDIR = '/workspace';
const MEMORY_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (§6)
const NANO_CPUS = 1_000_000_000; // 1 CPU (§6)

export interface DockerSandboxConfig {
  /** Base image. Defaults to praxis-sandbox-base:latest. */
  image?: string;
  /** Docker network to attach containers to (e.g. praxis-net). */
  network?: string;
  /** Per-container disk cap, e.g. "5G". Only honored when the storage driver
   *  supports StorageOpt (xfs+pquota) — silently unenforced on overlayfs. */
  diskLimit?: string;
  /** Outbound egress allowlist (ADR-0021/STORY-19). When set, the sandbox's
   *  HTTP(S)_PROXY env points every process at the allowlist proxy; paired with
   *  an internal `network`, anything not allowlisted has no route out. */
  egress?: {
    /** Forward-proxy URL the sandbox routes HTTP(S) through, e.g.
     *  `http://praxis-egress:3128`. */
    proxyUrl: string;
    /** Comma-separated hosts that bypass the proxy (loopback + any in-cluster
     *  host the sandbox calls back to). Defaults to localhost/127.0.0.1/::1. */
    noProxy?: string;
  };
  /** Durable snapshot store. When set, stop() snapshots /workspace and start()
   *  restores it into a fresh volume. Omit to disable persistence. */
  store?: ObjectStore;
  /** Local directory holding template sources (`<templatesDir>/<templateId>/…`).
   *  When set, start() seeds a fresh workspace from the chosen template. Omit to
   *  disable seeding (fresh workspaces stay empty). */
  templatesDir?: string;
  /** Override the dockerode instance (tests/alt sockets). */
  docker?: Docker;
}

function id(): string {
  return randomBytes(8).toString('hex');
}

/** Build the `Env` entries that route a sandbox's HTTP(S) traffic through the
 *  egress allowlist proxy (ADR-0021). Both upper- and lower-case forms are set
 *  since tools disagree on which they read. Loopback always bypasses the proxy. */
export function buildEgressEnv(egress: { proxyUrl: string; noProxy?: string }): string[] {
  const url = egress.proxyUrl;
  const noProxy = ['localhost', '127.0.0.1', '::1', egress.noProxy].filter(Boolean).join(',');
  return [
    `HTTP_PROXY=${url}`,
    `HTTPS_PROXY=${url}`,
    `http_proxy=${url}`,
    `https_proxy=${url}`,
    `NO_PROXY=${noProxy}`,
    `no_proxy=${noProxy}`,
  ];
}

function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function inWorkspace(p: string): string {
  return p.startsWith('/') ? p : posix.join(WORKDIR, p);
}

async function* toStringIterable(stream: Readable): AsyncIterable<string> {
  for await (const chunk of stream) {
    yield typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
  }
}

/** Run `docker exec` as a child process. The CLI demultiplexes stdout/stderr and
 *  handles the stdio attach natively (unlike dockerode under Bun). */
function dockerExec(
  containerId: string,
  argv: string[],
  opts: { stdin?: boolean; cwd?: string; env?: Record<string, string> } = {},
): ChildProcessWithoutNullStreams {
  const args = ['exec'];
  if (opts.stdin) args.push('-i');
  args.push('-w', opts.cwd ?? WORKDIR);
  for (const [k, v] of Object.entries(opts.env ?? {})) args.push('-e', `${k}=${v}`);
  args.push(containerId, ...argv);
  return spawnProcess(DOCKER_CLI, args, { stdio: ['pipe', 'pipe', 'pipe'] });
}

/** Run a command via `docker exec` and collect stdout/stderr + exit code. */
function execCapture(
  containerId: string,
  argv: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = dockerExec(containerId, argv, opts);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => out.push(d));
    proc.stderr.on('data', (d: Buffer) => err.push(d));
    proc.on('error', reject);
    proc.on('close', (code) =>
      resolve({
        exitCode: code ?? 0,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    );
  });
}

/** `docker cp <src> <dest>` (CLI — Bun-safe, unlike dockerode putArchive). */
function dockerCp(src: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawnProcess(DOCKER_CLI, ['cp', src, dest], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const err: Buffer[] = [];
    proc.stderr.on('data', (d: Buffer) => err.push(d));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`docker cp failed (exit ${code}): ${Buffer.concat(err).toString('utf8')}`),
          ),
    );
  });
}

/** Pipe `input` to a `docker exec -i` command's stdin and await its exit. Used
 *  to write files via the CLI: dockerode's putArchive sends a chunked request
 *  body the daemon rejects under Bun with `501 Unsupported transfer encoding`,
 *  so file writes (unlike getArchive reads) must go through the CLI — the same
 *  Bun↔dockerode incompatibility ADR-0010 routed exec/spawn around. */
function execWriteStdin(containerId: string, argv: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = dockerExec(containerId, argv, { stdin: true });
    const err: Buffer[] = [];
    proc.stderr.on('data', (d: Buffer) => err.push(d));
    proc.stdout.resume(); // drain `tee`'s echo so its pipe never blocks
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `docker exec write failed (exit ${code}): ${Buffer.concat(err).toString('utf8')}`,
            ),
          ),
    );
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

export class DockerSandbox implements Sandbox {
  private readonly docker: Docker;
  private readonly image: string;
  private readonly network?: string;
  private readonly diskLimit?: string;
  private readonly store?: ObjectStore;
  private readonly templatesDir?: string;
  /** Proxy env injected into every sandbox container when egress is restricted. */
  private readonly egressEnv?: string[];
  /** Last exec/spawn activity per projectId, for idle detection. */
  private readonly activity = new Map<string, number>();

  constructor(config: DockerSandboxConfig = {}) {
    this.docker = config.docker ?? new Docker();
    this.image = config.image ?? 'praxis-sandbox-base:latest';
    this.network = config.network;
    this.diskLimit = config.diskLimit;
    this.store = config.store;
    this.templatesDir = config.templatesDir;
    this.egressEnv = config.egress ? buildEgressEnv(config.egress) : undefined;
  }

  private container(handle: SandboxHandle): Docker.Container {
    return this.docker.getContainer(handle.containerId);
  }

  private touch(projectId: string): void {
    this.activity.set(projectId, Date.now());
  }

  private async findByName(name: string): Promise<Docker.Container | null> {
    const list = await this.docker.listContainers({
      all: true,
      filters: { name: [name] },
    });
    const match = list.find((c) => c.Names.some((n) => n === `/${name}`));
    return match ? this.docker.getContainer(match.Id) : null;
  }

  /** Run a command, discard output, resolve with its exit code. */
  private async execSimple(containerId: string, cmd: string[]): Promise<number> {
    const { exitCode } = await execCapture(containerId, cmd);
    return exitCode;
  }

  async start(projectId: string, templateId: string): Promise<SandboxHandle> {
    const name = `praxis-sandbox-${projectId}`;
    const volume = `praxis-project-${projectId}`;

    this.touch(projectId);

    const existing = await this.findByName(name);
    if (existing) {
      const info = await existing.inspect();
      if (!info.State.Running) await existing.start();
      return { projectId, containerId: info.Id };
    }

    const container = await this.docker.createContainer({
      name,
      Image: this.image,
      Cmd: ['sleep', 'infinity'],
      WorkingDir: WORKDIR,
      Labels: { 'praxis.projectId': projectId, 'praxis.templateId': templateId },
      // Proxy env (when egress is restricted) lives on the container so every
      // `docker exec`/agent spawn inherits it (ADR-0021); the agent's own `-e`
      // overrides add to, not replace, this.
      ...(this.egressEnv ? { Env: this.egressEnv } : {}),
      HostConfig: {
        Memory: MEMORY_BYTES,
        NanoCpus: NANO_CPUS,
        Binds: [`${volume}:${WORKDIR}`],
        ...(this.network ? { NetworkMode: this.network } : {}),
        ...(this.diskLimit ? { StorageOpt: { size: this.diskLimit } } : {}),
      },
    });
    await container.start();
    const handle: SandboxHandle = { projectId, containerId: (await container.inspect()).Id };

    // Restore from the durable snapshot when the volume is fresh (first run, or
    // the local volume was reclaimed). A populated volume is left untouched.
    let restored = false;
    if (this.store && (await this.isWorkspaceEmpty(handle.containerId))) {
      restored = await this.restore(handle, container);
    }
    // Fresh project, nothing restored → seed the chosen template (initial commit).
    if (!restored && (await this.isWorkspaceEmpty(handle.containerId))) {
      await this.seedTemplate(handle.containerId, templateId);
    }
    // Initialise git in the project dir if still fresh (no template seeded), and
    // locally ignore the agent's store dir (HOME=/workspace/.praxis-agent,
    // ADR-0017) via .git/info/exclude so it never lands in the user's commits.
    // The literal mirrors @praxis/acp-host AGENT_STORE_DIRNAME — can't import it
    // here (acp-host depends on this package; importing back would be circular).
    await this.execSimple(handle.containerId, [
      'bash',
      '-lc',
      'cd /workspace && { [ -d .git ] || git init -q; }; ' +
        "grep -qxF '.praxis-agent/' .git/info/exclude 2>/dev/null || echo '.praxis-agent/' >> .git/info/exclude",
    ]);
    return handle;
  }

  /** Copy templatesDir/<templateId> into a fresh /workspace and make it the
   *  initial git commit. No-op when no templatesDir is configured or the
   *  template doesn't exist on disk (unknown id → an empty workspace, as before).
   *  Uses `docker cp` (the CLI is Bun-safe; dockerode putArchive 501s under Bun —
   *  see ADR-0010/0014). */
  private async seedTemplate(containerId: string, templateId: string): Promise<void> {
    if (!this.templatesDir) return;
    const src = pathJoin(this.templatesDir, templateId);
    if (!existsSync(src) || !statSync(src).isDirectory()) return;
    await dockerCp(`${src}/.`, `${containerId}:${WORKDIR}/`);
    await execCapture(containerId, [
      'bash',
      '-lc',
      `cd ${WORKDIR} && git init -q && git add -A && ` +
        `git -c user.email=agent@praxis.local -c user.name=Praxis ` +
        `commit -q -m "Seed ${templateId} template"`,
    ]);
  }

  private async isWorkspaceEmpty(containerId: string): Promise<boolean> {
    const { stdout } = await execCapture(containerId, [
      'bash',
      '-lc',
      '[ -z "$(ls -A /workspace 2>/dev/null)" ] && echo empty || echo no',
    ]);
    return stdout.trim() === 'empty';
  }

  async exec(handle: SandboxHandle, cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    this.touch(handle.projectId);
    const base = ['bash', '-lc', cmd];
    const argv =
      opts.timeoutMs && opts.timeoutMs > 0
        ? ['timeout', `${Math.ceil(opts.timeoutMs / 1000)}s`, ...base]
        : base;
    return execCapture(handle.containerId, argv, { cwd: opts.cwd, env: opts.env });
  }

  async spawn(handle: SandboxHandle, cmd: string, opts: SpawnOptions = {}): Promise<ProcessHandle> {
    this.touch(handle.projectId);
    const { containerId } = handle;
    const token = id();
    const pidFile = `/tmp/praxis-${token}.pid`;
    // Record the in-container PID, then exec the command in its place so the
    // PID stays valid for kill() (killing the local `docker exec` wouldn't stop
    // the in-container process).
    const wrapped = `echo $$ > ${pidFile}; exec bash -lc ${shSingleQuote(cmd)}`;
    const proc = dockerExec(containerId, ['bash', '-lc', wrapped], {
      stdin: true,
      cwd: opts.cwd,
      env: opts.env,
    });

    // Buffer stdout/stderr eagerly. We `await readPid` before returning, and the
    // caller attaches its consumer later still — without an immediate sink the
    // output emitted in that window would be lost.
    const out = new PassThrough();
    const err = new PassThrough();
    proc.stdout.pipe(out);
    proc.stderr.pipe(err);

    // Capture the exit code eagerly — `close` fires once, so a listener attached
    // lazily in wait() would miss it if the process already exited.
    // `docker exec` (foreground) exits with the in-container command's code.
    const exited = new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 0));
    });

    const pid = await this.readPid(containerId, pidFile);

    return {
      pid,
      stdout: toStringIterable(out),
      stderr: toStringIterable(err),
      write: async (data: string) => {
        proc.stdin.write(data);
      },
      kill: async (signal: NodeJS.Signals = 'SIGTERM') => {
        await this.execSimple(containerId, ['kill', `-${signal}`, String(pid)]);
      },
      wait: () => exited,
    };
  }

  private async readPid(containerId: string, pidFile: string): Promise<number> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { stdout } = await execCapture(containerId, ['cat', pidFile]);
      const n = Number.parseInt(stdout.trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('failed to read spawned process pid');
  }

  async writeFile(handle: SandboxHandle, path: string, content: string): Promise<void> {
    this.touch(handle.projectId);
    const abs = inWorkspace(path);
    const dir = posix.dirname(abs);
    await this.execSimple(handle.containerId, ['mkdir', '-p', dir]);
    // Write via `tee` over `docker exec -i` (not dockerode putArchive — that
    // 501s under Bun; see execWriteStdin). `tee` takes the path as a single
    // argv, so no shell quoting of the path is needed.
    await execWriteStdin(handle.containerId, ['tee', abs], content);
  }

  async readFile(handle: SandboxHandle, path: string): Promise<string> {
    const container = this.container(handle);
    const abs = inWorkspace(path);
    const stream = await container.getArchive({ path: abs });
    return await new Promise<string>((resolve, reject) => {
      const extract = tar.extract();
      const chunks: Buffer[] = [];
      let found = false;
      extract.on('entry', (_header, entryStream, next) => {
        found = true;
        entryStream.on('data', (d: Buffer) => chunks.push(d));
        entryStream.on('end', next);
        entryStream.resume();
      });
      extract.on('finish', () =>
        found
          ? resolve(Buffer.concat(chunks).toString('utf8'))
          : reject(new Error('file not found')),
      );
      extract.on('error', reject);
      (stream as NodeJS.ReadableStream).pipe(extract);
    });
  }

  watchFiles(handle: SandboxHandle, cb: (event: FileEvent) => void): Unsubscribe {
    const { containerId } = handle;
    const token = id();
    const pidFile = `/tmp/praxis-${token}.pid`;
    let proc: ChildProcessWithoutNullStreams | null = null;
    let pid: number | undefined;
    let stopped = false;

    void (async () => {
      try {
        const wrapped =
          `echo $$ > ${pidFile}; ` +
          // Exclude the agent's store dir (HOME=/workspace/.praxis-agent, ADR-0017)
          // so its per-turn churn never floods the room as file_changed events.
          `exec inotifywait -m -r -q -e create,modify,delete,move ` +
          `--exclude '(^|/)\\.praxis-agent(/|$)' --format '%e|%w%f' ${WORKDIR}`;
        proc = dockerExec(containerId, ['bash', '-lc', wrapped]);
        if (stopped) {
          proc.kill();
          return;
        }
        proc.stderr.resume();
        let buf = '';
        proc.stdout.on('data', (d: Buffer) => {
          buf += d.toString('utf8');
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            const ev = parseInotifyLine(line);
            if (ev && !stopped) cb(ev);
          }
        });
        pid = await this.readPid(containerId, pidFile).catch(() => undefined);
      } catch {
        // The container was torn down mid-setup, or the exec failed — there is
        // nothing to watch. Never surface as an unhandled rejection.
      }
    })();

    return () => {
      stopped = true;
      if (proc) proc.kill();
      if (pid) void this.execSimple(containerId, ['kill', String(pid)]).catch(() => {});
    };
  }

  async exposePort(handle: SandboxHandle, port: number): Promise<string> {
    const info = await this.container(handle).inspect();
    const networks = info.NetworkSettings?.Networks ?? {};
    let ip = info.NetworkSettings?.IPAddress || '';
    for (const net of Object.values(networks)) {
      if (net?.IPAddress) {
        ip = net.IPAddress;
        break;
      }
    }
    if (!ip) throw new Error('sandbox container has no network IP');
    return `http://${ip}:${port}`;
  }

  async stop(handle: SandboxHandle): Promise<void> {
    const container = this.container(handle);
    // Snapshot the project to durable storage before tearing the container down.
    if (this.store) {
      try {
        await this.snapshot(handle, container);
      } catch {
        // Best-effort; the named volume still holds state for a local restart.
      }
    }
    // remove(force) stops a running container and removes it in one call.
    // Tolerate "already gone" (404) and "removal already in progress" (409),
    // which race when stop() and the daemon's own cleanup overlap.
    try {
      await container.remove({ force: true, v: false });
    } catch (err) {
      if (!isAlreadyGone(err)) throw err;
    }
    this.activity.delete(handle.projectId);
  }

  /** Permanently remove a project's sandbox: container, named volume, and any
   *  durable snapshot. Idempotent — tolerates each artifact already being gone. */
  async destroy(projectId: string): Promise<void> {
    const container = await this.findByName(`praxis-sandbox-${projectId}`);
    if (container) {
      try {
        await container.remove({ force: true, v: false });
      } catch (err) {
        if (!isAlreadyGone(err)) throw err;
      }
    }
    try {
      await this.docker.getVolume(`praxis-project-${projectId}`).remove({ force: true });
    } catch (err) {
      if (!isAlreadyGone(err)) throw err;
    }
    if (this.store) await this.store.deleteSnapshot(projectId);
    this.activity.delete(projectId);
  }

  /** Copy a source project's volume (files + .git) into the new project's volume
   *  via a short-lived helper container that mounts both and runs `cp -a`. The
   *  source is mounted read-only (never mutated). Returns false when the source
   *  has no volume to copy (caller seeds the template instead). See ADR-0019.
   *  Volume-to-volume copy keeps this Bun-safe — no streamed putArchive; the
   *  helper lifecycle is unary dockerode, like destroy(). */
  async clone(sourceProjectId: string, newProjectId: string): Promise<boolean> {
    const srcVolume = `praxis-project-${sourceProjectId}`;
    const dstVolume = `praxis-project-${newProjectId}`;

    // Nothing to copy if the source never started (no volume).
    try {
      await this.docker.getVolume(srcVolume).inspect();
    } catch (err) {
      if (isAlreadyGone(err)) return false;
      throw err;
    }

    // `cp -a /src/. /dst/` copies contents incl. dotfiles (.git) into the new
    // volume, which Docker auto-creates on mount. Source is read-only.
    const helper = await this.docker.createContainer({
      Image: this.image,
      Cmd: ['cp', '-a', '/src/.', '/dst/'],
      HostConfig: { Binds: [`${srcVolume}:/src:ro`, `${dstVolume}:/dst`] },
    });
    try {
      await helper.start();
      const status = (await helper.wait()) as { StatusCode?: number };
      const code = status?.StatusCode ?? 0;
      if (code !== 0) {
        throw new Error(`sandbox clone failed (exit ${code})`);
      }
    } finally {
      await helper.remove({ force: true }).catch(() => {});
    }
    return true;
  }

  /** Tar /workspace out of the container and PUT it to the object store. */
  private async snapshot(handle: SandboxHandle, container: Docker.Container): Promise<void> {
    if (!this.store) return;
    const archive = (await container.getArchive({ path: WORKDIR })) as NodeJS.ReadableStream;
    await this.store.putSnapshot(handle.projectId, Readable.from(archive));
  }

  /** Restore a project's snapshot tarball into the container's /workspace. */
  private async restore(handle: SandboxHandle, container: Docker.Container): Promise<boolean> {
    if (!this.store) return false;
    const snap = await this.store.getSnapshot(handle.projectId);
    if (!snap) return false;
    // getArchive(/workspace) tars entries as `workspace/…`; extract at `/`.
    // KNOWN ISSUE (see ADR-0010 update): putArchive 501s under Bun for streamed
    // uploads — this restore path must move to the docker CLI before object-store
    // snapshots are relied on in prod. Out of scope for STORY-26 (file save).
    await container.putArchive(snap as unknown as NodeJS.ReadableStream, { path: '/' });
    return true;
  }

  /**
   * Running sandboxes whose last exec/spawn activity is older than `idleMs`.
   * Sandboxes started by a previous process (no in-memory activity) fall back
   * to their container start time, so they age out rather than persist forever.
   */
  async listIdle(idleMs: number, now: number = Date.now()): Promise<SandboxHandle[]> {
    const list = await this.docker.listContainers({
      filters: { label: ['praxis.projectId'], status: ['running'] },
    });
    const idle: SandboxHandle[] = [];
    for (const c of list) {
      const projectId = c.Labels['praxis.projectId'];
      if (!projectId) continue;
      const last = this.activity.get(projectId) ?? c.Created * 1000;
      if (now - last > idleMs) idle.push({ projectId, containerId: c.Id });
    }
    return idle;
  }

  /** Count of currently-running sandbox containers (praxis.projectId label) — for
   *  the admin overview's "running sandboxes" tile (STORY-48). Unary dockerode
   *  call, Bun-safe. */
  async runningCount(): Promise<number> {
    const list = await this.docker.listContainers({
      filters: { label: ['praxis.projectId'], status: ['running'] },
    });
    return list.length;
  }
}

/** True for dockerode errors meaning the container is already gone or being
 *  removed — safe to treat stop() as succeeded. */
function isAlreadyGone(err: unknown): boolean {
  const code = (err as { statusCode?: number } | null)?.statusCode;
  return code === 404 || code === 409;
}

function parseInotifyLine(line: string): FileEvent | null {
  const sep = line.indexOf('|');
  if (sep < 0) return null;
  const events = line.slice(0, sep).split(',');
  const fullPath = line.slice(sep + 1);
  const path = fullPath.replace(new RegExp(`^${WORKDIR}/?`), '');
  let type: FileEventType | null = null;
  if (events.includes('DELETE') || events.includes('MOVED_FROM')) type = 'delete';
  else if (events.includes('CREATE') || events.includes('MOVED_TO')) type = 'create';
  else if (events.includes('MODIFY')) type = 'modify';
  if (!type || !path) return null;
  return { type, path };
}

export { parseInotifyLine };
