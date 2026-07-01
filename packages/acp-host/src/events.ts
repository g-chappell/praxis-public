// Typed events emitted by AcpHost during a prompt turn. The shapes mirror ACP
// `session/update` kinds (ADR-0009) so a future ACP-native agent maps cleanly
// onto the same vocabulary.

/** A streamed slice of the agent's text response. */
export interface TextChunkEvent {
  type: 'text-chunk';
  text: string;
}

/** The agent invoked a tool. */
export interface ToolCallEvent {
  type: 'tool-call';
  toolCallId: string;
  title: string;
  /** Raw tool input as provided by the agent. */
  input: unknown;
}

/** A tool call produced a result. */
export interface ToolResultEvent {
  type: 'tool-result';
  toolCallId: string;
  /** True when the tool reported failure. */
  isError: boolean;
  output: unknown;
}

/** The agent created, modified, or deleted a file in the workspace. */
export interface FileChangeEvent {
  type: 'file-change';
  change: 'create' | 'modify' | 'delete';
  /** Path relative to the project root. */
  path: string;
}

/** Per-turn token usage, surfaced for metering/billing (ADR-0009). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The prompt turn finished. Carries usage so the orchestrator can meter spend. */
export interface TurnCompleteEvent {
  type: 'turn-complete';
  /** ACP stop reason, e.g. 'end_turn' | 'cancelled' | 'max_tokens'. */
  stopReason: string;
  usage: TokenUsage | null;
}

/** The turn failed. */
export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type AcpEvent =
  | TextChunkEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileChangeEvent
  | TurnCompleteEvent
  | ErrorEvent;

/** A tool-permission request surfaced to the caller for approval. */
export interface PermissionRequest {
  toolCallId: string;
  title: string;
  input: unknown;
}

/** The caller's decision on a PermissionRequest. Denial cancels the turn cleanly. */
export type PermissionDecision = 'allow' | 'deny';
