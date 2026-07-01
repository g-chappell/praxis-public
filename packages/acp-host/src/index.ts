// @praxis/acp-host — the ACP host layer (ADR-0009, ADR-0016). Spawns a persistent
// ACP-speaking agent inside a Sandbox and streams typed events across many prompt
// turns over one shared session.

export {
  ClaudeAcpHost,
  ACP_AGENT_COMMAND,
  AGENT_STORE_DIRNAME,
  AgentBusyError,
} from './acp-host.js';
export type { AcpHost, AgentSession, OpenAgentOptions, PromptOptions } from './acp-host.js';
export type {
  AcpEvent,
  TextChunkEvent,
  ToolCallEvent,
  ToolResultEvent,
  FileChangeEvent,
  TurnCompleteEvent,
  ErrorEvent,
  TokenUsage,
  PermissionRequest,
  PermissionDecision,
} from './events.js';
