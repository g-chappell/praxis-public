// Config resolution for the image-gen MCP server (STORY-15/TASK-044). The server
// is spawned by Claude Code as a stdio child, so it can't be handed secrets via
// our (sacred) acp-host spawn env, and `.mcp.json` lives in /workspace (git +
// MinIO) so it must hold no secrets either. Per ADR-0018 the orchestrator writes
// an ephemeral JSON cred file at an absolute path OUTSIDE /workspace and points
// the server at it via PRAXIS_MCP_CONFIG (a non-secret path in .mcp.json). The
// file wins; plain env vars are the fallback for local/standalone runs.

import { readFileSync } from 'node:fs';

/** Secrets/endpoints the orchestrator delivers via the cred file. */
interface CredFile {
  openaiApiKey?: string;
  usageUrl?: string;
  usageToken?: string;
}

export interface ResolvedConfig {
  /** OpenAI key; undefined → the server refuses to start (see index.ts). */
  openaiApiKey?: string;
  /** Orchestrator usage-cap endpoint; undefined → generation runs uncapped. */
  usageUrl?: string;
  /** Per-room capability token presented to the usage endpoint. */
  usageToken?: string;
  workspaceRoot: string;
  texturesDir: string;
  model: string;
}

type ReadFile = (path: string) => string;

/** Resolve config from the cred file (PRAXIS_MCP_CONFIG) with env fallback. A
 *  missing or malformed cred file never throws — it falls through to env so a
 *  botched seed degrades to the normal "no key → refuse to start" path rather
 *  than crash-looping. */
export function resolveConfig(
  env: NodeJS.ProcessEnv,
  readFile: ReadFile = readFileSync as unknown as ReadFile,
): ResolvedConfig {
  let cred: CredFile = {};
  const credPath = env.PRAXIS_MCP_CONFIG;
  if (credPath) {
    try {
      const parsed = JSON.parse(readFile(credPath)) as unknown;
      if (parsed && typeof parsed === 'object') cred = parsed as CredFile;
    } catch {
      // Missing/unreadable/malformed → ignore and use env.
    }
  }

  const workspaceRoot = env.PRAXIS_WORKSPACE_ROOT ?? '/workspace';
  return {
    openaiApiKey: cred.openaiApiKey ?? env.OPENAI_API_KEY,
    usageUrl: cred.usageUrl ?? env.PRAXIS_MCP_USAGE_URL,
    usageToken: cred.usageToken ?? env.PRAXIS_MCP_TOKEN,
    workspaceRoot,
    texturesDir: env.PRAXIS_TEXTURES_DIR ?? `${workspaceRoot}/public/textures`,
    model: env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
  };
}
