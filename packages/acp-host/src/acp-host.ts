// The AcpHost interface + its Claude implementation — one of the two load-bearing
// abstractions in Praxis (the other is Sandbox). Consumers depend ONLY on the
// `AcpHost` / `AgentSession` interfaces, never on the ACP client library or the
// agent adapter directly, so the transport (the claude-agent-acp adapter today; a
// native-ACP agent later) is swappable without touching them. Changing this
// interface's shape requires an ADR — see ADR-0009 and ADR-0016.
//
// ADR-0016: the agent is a persistent, room-scoped session — `openAgent` spawns
// one long-lived agent process + ACP session, and `AgentSession.prompt` drives
// many turns over it (conversation continuity; one shared agent two users drive)
// until `close`. This replaces the earlier turn-scoped spawn+kill-per-prompt.

import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type {
  Client,
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
  Usage,
} from '@agentclientprotocol/sdk';
import type { ProcessHandle, Sandbox, SandboxHandle } from '@praxis/sandbox';
import type { AcpEvent, PermissionDecision, PermissionRequest, TokenUsage } from './events.js';

export interface PromptOptions {
  /** Called when the agent requests permission to use a tool. Resolving with
   *  'deny' rejects the call and cancels the turn cleanly. */
  onPermission(request: PermissionRequest): Promise<PermissionDecision>;
  /** Abort this turn: cancels the prompt and ends the iterator. Does NOT end the
   *  session — the agent stays alive for the next prompt. */
  signal?: AbortSignal;
}

/**
 * A live agent session: one agent process + one ACP session, shared across many
 * prompt turns and (in the orchestrator) across the users in a project room.
 * Turns are serialised — one active turn at a time; `prompt` while `busy` throws
 * `AgentBusyError`. See ADR-0016.
 */
export interface AgentSession {
  /** Drive one turn over the persistent session; stream typed events until it
   *  completes. Throws `AgentBusyError` if a turn is already in flight, or if the
   *  session is no longer `alive`. */
  prompt(text: string, options: PromptOptions): AsyncIterable<AcpEvent>;
  /** Cancel the in-flight turn (ACP cancel) without ending the session. No-op if
   *  no turn is active. */
  cancel(): void;
  /** End the ACP session and kill the agent process. Idempotent. */
  close(): Promise<void>;
  /** False once `close` has run or the agent process died — the consumer should
   *  open a fresh session before prompting again. */
  readonly alive: boolean;
  /** True while a turn is in flight (one active turn per session). */
  readonly busy: boolean;
  /** The ACP session id — persist it so a later open can resume this conversation
   *  via `resumeSessionId` (ADR-0017). */
  readonly sessionId: string;
  /** True when this session was resumed from a prior one via ACP session/load;
   *  false when it was created fresh (no `resumeSessionId`, the agent lacks the
   *  loadSession capability, or the load failed and we fell back to a new session). */
  readonly resumed: boolean;
}

/** Options for opening an agent session (ADR-0017). */
export interface OpenAgentOptions {
  /** A prior ACP session id to resume via session/load. When the agent advertises
   *  the `loadSession` capability and the load succeeds, the conversation history
   *  is restored; otherwise the host falls back to a fresh session. */
  resumeSessionId?: string;
}

/** Thrown by `AgentSession.prompt` when a turn is already in flight. The
 *  orchestrator maps this to an `agent_busy` signal rather than racing a second
 *  turn (how that's surfaced — queue vs handoff — is STORY-34). */
export class AgentBusyError extends Error {
  constructor() {
    super('agent session already has a turn in flight');
    this.name = 'AgentBusyError';
  }
}

/** Spawns an ACP-speaking agent in a sandbox and hands back a persistent
 *  `AgentSession`. See ADR-0009 (transport + platform key) and ADR-0016 (session
 *  lifecycle). */
export interface AcpHost {
  /**
   * Spawn the agent in `handle` and open one ACP session. `apiKey` is the
   * Anthropic API key the agent authenticates with — the project owner's billing
   * identity (ADR-0009), bound once for the whole shared session.
   */
  openAgent(
    sandbox: Sandbox,
    handle: SandboxHandle,
    apiKey: string,
    options?: OpenAgentOptions,
  ): Promise<AgentSession>;
}

/** The ACP agent binary inside the sandbox (the `claude-agent-acp` adapter,
 *  baked into the base image per ADR-0009). It serves ACP over stdio and reads
 *  `ANTHROPIC_API_KEY` from its environment. */
export const ACP_AGENT_COMMAND = 'claude-agent-acp';

/** The sandbox working directory (base image WORKDIR). Must be absolute. */
const WORKSPACE_DIR = '/workspace';

/** Directory name of the agent's relocated store under the workspace (STORY-36).
 *  Consumers exclude it from file views + git (see orchestrator / sandbox). */
export const AGENT_STORE_DIRNAME = '.praxis-agent';

/** The agent's HOME inside the sandbox (ADR-0017). claude-code stores its config
 *  + session history under $HOME (.claude.json, .claude/projects/*.jsonl that ACP
 *  session/load reads). Pointing HOME at a hidden dir under the persisted
 *  /workspace volume makes that store survive a teardown, enabling cross-session
 *  memory. Auto-created by the agent on first run. */
const AGENT_HOME = `${WORKSPACE_DIR}/${AGENT_STORE_DIRNAME}`;

/**
 * `AcpHost` backed by the `claude-agent-acp` adapter (ADR-0009). Talks ACP to a
 * persistent agent process spawned inside the sandbox via the `Sandbox`
 * interface.
 */
export class ClaudeAcpHost implements AcpHost {
  openAgent(
    sandbox: Sandbox,
    handle: SandboxHandle,
    apiKey: string,
    options?: OpenAgentOptions,
  ): Promise<AgentSession> {
    return ClaudeAgentSession.open(sandbox, handle, apiKey, options);
  }
}

/** One persistent ACP session over a long-lived agent process. */
class ClaudeAgentSession implements AgentSession {
  private connection!: ClientSideConnection;
  private acpSessionId!: string;
  private _resumed = false;
  // The active turn's event sink + permission handler, set for the duration of a
  // prompt() turn and cleared when it drains. `sessionUpdate`/`requestPermission`
  // callbacks (which fire only during a turn) read these.
  private currentQueue?: EventQueue<AcpEvent>;
  private currentOnPermission?: (request: PermissionRequest) => Promise<PermissionDecision>;
  private _alive = true;

  private constructor(private readonly proc: ProcessHandle) {}

  get alive(): boolean {
    return this._alive;
  }

  get busy(): boolean {
    return this.currentQueue !== undefined;
  }

  get sessionId(): string {
    return this.acpSessionId;
  }

  get resumed(): boolean {
    return this._resumed;
  }

  static async open(
    sandbox: Sandbox,
    handle: SandboxHandle,
    apiKey: string,
    options?: OpenAgentOptions,
  ): Promise<ClaudeAgentSession> {
    const proc = await sandbox.spawn(handle, ACP_AGENT_COMMAND, {
      cwd: WORKSPACE_DIR,
      // The agent authenticates with the platform API key. We deliberately pass
      // ONLY this key — no CLAUDE_CODE_OAUTH_TOKEN — so there is no ambiguous or
      // ToS-risky subscription fallback (ADR-0009). HOME points the agent's store
      // at a persisted, hidden dir so its memory + session history survive a
      // teardown (ADR-0017/STORY-36).
      env: { ANTHROPIC_API_KEY: apiKey, HOME: AGENT_HOME },
    });

    const session = new ClaudeAgentSession(proc);
    const stream = ndJsonStream(toWritable(proc), toReadable(proc.stdout));
    session.connection = new ClientSideConnection(() => session.clientImpl, stream);

    // If the agent process dies, mark the session dead and fail any active turn;
    // the consumer opens a fresh session on its next prompt (ADR-0016).
    void session.connection.closed.then(() => session.handleClosed());

    const init = await session.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      // Minimal client: the agent runs in the sandbox with direct filesystem
      // access, so we advertise no client-side fs/terminal capabilities.
      clientCapabilities: {},
    });

    // Resume the prior conversation when asked and the agent can (ADR-0017). On
    // any failure (capability absent, unknown/expired id, load error) fall back
    // to a fresh session — never block the user on a bad resume. loadSession
    // replays history via session/update notifications before it resolves; those
    // arrive with no active turn, so they're ignored (we don't re-render history).
    const canLoad = init.agentCapabilities?.loadSession === true;
    if (options?.resumeSessionId && canLoad) {
      try {
        await session.connection.loadSession({
          sessionId: options.resumeSessionId,
          cwd: WORKSPACE_DIR,
          mcpServers: [],
        });
        session.acpSessionId = options.resumeSessionId;
        session._resumed = true;
        return session;
      } catch {
        // fall through to a fresh session
      }
    }

    const acp = await session.connection.newSession({ cwd: WORKSPACE_DIR, mcpServers: [] });
    session.acpSessionId = acp.sessionId;
    return session;
  }

  // Stable client handler; the ACP connection invokes these during a turn. Reads
  // the active turn's queue/permission handler via `this`.
  private readonly clientImpl: Client = {
    sessionUpdate: async ({ update }) => {
      const queue = this.currentQueue;
      if (!queue) return;
      for (const event of mapSessionUpdate(update)) queue.push(event);
    },
    requestPermission: async (
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> => {
      const handler = this.currentOnPermission;
      const decision = handler ? await handler(toPermissionRequest(params)) : 'deny';
      const optionId = pickOption(params.options, decision);
      if (optionId !== undefined) {
        return { outcome: { outcome: 'selected', optionId } };
      }
      // No matching option offered (rare). Cancel the turn cleanly rather than
      // leave the agent waiting.
      await this.connection.cancel({ sessionId: this.acpSessionId }).catch(() => {});
      return { outcome: { outcome: 'cancelled' } };
    },
  };

  async *prompt(text: string, options: PromptOptions): AsyncIterable<AcpEvent> {
    // The caller is expected to check `alive` and re-open first; this is a guard.
    if (!this._alive) throw new Error('agent session is closed');
    if (this.busy) throw new AgentBusyError();

    const queue = new EventQueue<AcpEvent>();
    this.currentQueue = queue;
    this.currentOnPermission = options.onPermission;

    let settled = false;
    const finish = (event?: AcpEvent): void => {
      if (settled) return;
      settled = true;
      if (event) queue.push(event);
      queue.close();
    };

    const onAbort = (): void => this.cancel();
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    void (async () => {
      try {
        const response = await this.connection.prompt({
          sessionId: this.acpSessionId,
          prompt: [{ type: 'text', text }],
        });
        finish({
          type: 'turn-complete',
          stopReason: response.stopReason,
          usage: toTokenUsage(response.usage),
        });
      } catch (err) {
        finish({ type: 'error', message: errorMessage(err) });
      }
    })();

    try {
      yield* queue;
    } finally {
      this.currentQueue = undefined;
      this.currentOnPermission = undefined;
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
    }
  }

  cancel(): void {
    if (this._alive && this.currentQueue) {
      this.connection.cancel({ sessionId: this.acpSessionId }).catch(() => {});
    }
  }

  async close(): Promise<void> {
    if (!this._alive && !this.currentQueue) {
      await this.proc.kill().catch(() => {});
      return;
    }
    this._alive = false;
    // Cancel an in-flight turn before killing, so the agent isn't torn down
    // mid-tool-call without a chance to settle.
    if (this.currentQueue) {
      await this.connection.cancel({ sessionId: this.acpSessionId }).catch(() => {});
    }
    await this.proc.kill().catch(() => {});
  }

  /** The agent process closed (crash or kill): mark dead and fail any live turn. */
  private handleClosed(): void {
    this._alive = false;
    const queue = this.currentQueue;
    if (queue) {
      queue.push({ type: 'error', message: 'agent connection closed before the turn completed' });
      queue.close();
    }
  }
}

function mapSessionUpdate(update: SessionUpdate): AcpEvent[] {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      if (update.content.type === 'text') {
        return [{ type: 'text-chunk', text: update.content.text }];
      }
      return [];
    }
    case 'tool_call':
      return [
        {
          type: 'tool-call',
          toolCallId: update.toolCallId,
          title: update.title,
          input: update.rawInput,
        },
      ];
    case 'tool_call_update': {
      const events: AcpEvent[] = [];
      for (const content of update.content ?? []) {
        if (content.type === 'diff') {
          events.push({
            type: 'file-change',
            change: content.oldText == null ? 'create' : 'modify',
            path: content.path,
          });
        }
      }
      if (update.status === 'completed' || update.status === 'failed') {
        events.push({
          type: 'tool-result',
          toolCallId: update.toolCallId,
          isError: update.status === 'failed',
          output: update.rawOutput,
        });
      }
      return events;
    }
    default:
      // Plans, thoughts, mode/usage updates, etc. are not surfaced for the POC.
      return [];
  }
}

function toPermissionRequest(params: RequestPermissionRequest): PermissionRequest {
  return {
    toolCallId: params.toolCall.toolCallId,
    title: params.toolCall.title ?? params.toolCall.toolCallId,
    input: params.toolCall.rawInput,
  };
}

/** Map an allow/deny decision onto one of the agent's offered permission
 *  options. Returns undefined when no option of the requested polarity exists. */
function pickOption(options: PermissionOption[], decision: PermissionDecision): string | undefined {
  const preferred =
    decision === 'allow'
      ? (['allow_once', 'allow_always'] as const)
      : (['reject_once', 'reject_always'] as const);
  for (const kind of preferred) {
    const match = options.find((option) => option.kind === kind);
    if (match) return match.optionId;
  }
  return undefined;
}

function toTokenUsage(usage: Usage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Adapt the sandbox process's stdin (`write`) into the byte WritableStream the
 *  ACP ndJsonStream encodes into. */
function toWritable(proc: ProcessHandle): WritableStream<Uint8Array> {
  const decoder = new TextDecoder();
  return new WritableStream<Uint8Array>({
    async write(chunk) {
      await proc.write(decoder.decode(chunk, { stream: true }));
    },
  });
}

/** Adapt the sandbox process's stdout (`AsyncIterable<string>`) into the byte
 *  ReadableStream the ACP ndJsonStream decodes from. */
function toReadable(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Minimal unbounded async queue that bridges the ACP client's push-based
 * callbacks (`sessionUpdate`) to the pull-based `AsyncIterable<AcpEvent>` the
 * caller consumes. Buffered events drain before `done` is reported.
 */
class EventQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let waiter = this.waiters.shift();
    while (waiter) {
      waiter({ value: undefined, done: true });
      waiter = this.waiters.shift();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
