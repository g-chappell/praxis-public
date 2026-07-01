// Seed MCP servers into a project's sandbox (STORY-15 image-gen via ADR-0018;
// STORY-50/ADR-0020 registry connectors). The orchestrator writes Claude-Code
// discovery config into /workspace (no secrets — committable) so the adapter
// auto-connects the stdio wrappers baked into sandbox-base, and delivers secrets
// via an ephemeral cred file at an ABSOLUTE path OUTSIDE /workspace (never
// git-committed nor MinIO-snapshotted, never in the acp-host spawn env). All
// writers READ-MERGE so image-gen and registry connectors coexist. Kept out of
// DockerSandbox: this uses only readFile/writeFile (Pick, so tests fake it).

import type { Sandbox, SandboxHandle } from '@praxis/sandbox';

import { logger } from './logger';
import type { EnabledConnector } from './mcp-registry';

type SeedSandbox = Pick<Sandbox, 'readFile' | 'writeFile'>;

/** Absolute path (outside /workspace) of the ephemeral cred file the in-sandbox
 *  servers read on startup via PRAXIS_MCP_CONFIG. */
export const MCP_CRED_PATH = '/run/praxis-mcp/config.json';

const MCP_JSON_PATH = '.mcp.json';
const CLAUDE_SETTINGS_PATH = '.claude/settings.json';

async function readJson(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  path: string,
): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await sandbox.readFile(handle, path)) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Missing / unreadable / malformed → start fresh.
  }
  return {};
}

/** Read-merge `mcpServers` into /workspace/.mcp.json (no secrets). */
async function mergeMcpServers(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  servers: Record<string, unknown>,
): Promise<void> {
  const json = await readJson(sandbox, handle, MCP_JSON_PATH);
  const existing = (json.mcpServers as Record<string, unknown> | undefined) ?? {};
  json.mcpServers = { ...existing, ...servers };
  await sandbox.writeFile(handle, MCP_JSON_PATH, `${JSON.stringify(json, null, 2)}\n`);
}

/** Read-merge keys into the ephemeral cred file (outside /workspace). */
async function mergeCredFile(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  patch: Record<string, unknown>,
): Promise<void> {
  const cred = await readJson(sandbox, handle, MCP_CRED_PATH);
  await sandbox.writeFile(
    handle,
    MCP_CRED_PATH,
    `${JSON.stringify({ ...cred, ...patch }, null, 2)}\n`,
  );
}

/** Set enableAllProjectMcpServers + read-merge any per-template tool-permission
 *  allow entries (mcp__<name>__<command>) into Claude settings, without clobbering
 *  other keys a template/agent may add. */
async function mergeSettings(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  allowTools: string[],
): Promise<void> {
  const settings = await readJson(sandbox, handle, CLAUDE_SETTINGS_PATH);
  settings.enableAllProjectMcpServers = true;
  if (allowTools.length > 0) {
    const perms = (settings.permissions as { allow?: string[] } | undefined) ?? {};
    perms.allow = Array.from(new Set([...(perms.allow ?? []), ...allowTools]));
    settings.permissions = perms;
  }
  await sandbox.writeFile(handle, CLAUDE_SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

/** Wire the image-gen server for this session (STORY-15, ADR-0018). No-op +
 *  returns false when no OpenAI key is configured (clean degrade). Read-merges so
 *  it coexists with registry connectors. */
export async function seedImageGenMcp(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  opts: { openaiKey?: string; usageToken: string; usageUrl: string },
): Promise<boolean> {
  if (!opts.openaiKey) return false;

  await mergeMcpServers(sandbox, handle, {
    'image-gen': {
      command: 'praxis-mcp-image-gen',
      args: [],
      env: { PRAXIS_MCP_CONFIG: MCP_CRED_PATH, PRAXIS_WORKSPACE_ROOT: '/workspace' },
    },
  });
  // image-gen's wrapper reads the FLAT top-level keys (unchanged contract).
  await mergeCredFile(sandbox, handle, {
    openaiApiKey: opts.openaiKey,
    usageUrl: opts.usageUrl,
    usageToken: opts.usageToken,
  });
  await mergeSettings(sandbox, handle, []);

  logger.info({ projectId: handle.projectId }, 'mcp.image_gen_wired');
  return true;
}

/** Wire the enabled registry connectors for this session (STORY-50/TASK-148,
 *  ADR-0020). For each connector: render its .mcp.json entry (baked wrapper),
 *  write its credential section in the cred file (the plaintext was decrypted
 *  web-side and passed in), and add its allowed_commands to the settings allow-
 *  list. Read-merges, so this coexists with image-gen. Returns the count wired. */
export async function seedRegistryConnectors(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  connectors: EnabledConnector[],
  creds: Record<string, string>,
  opts: { usageUrl: string; usageToken: string },
): Promise<number> {
  if (connectors.length === 0) return 0;

  const servers: Record<string, unknown> = {};
  const credPatch: Record<string, unknown> = {};
  const allowTools: string[] = [];

  for (const c of connectors) {
    servers[c.name] = {
      command: c.command,
      args: c.args,
      env: { PRAXIS_MCP_CONFIG: MCP_CRED_PATH, PRAXIS_WORKSPACE_ROOT: '/workspace' },
    };
    credPatch[c.name] = {
      credential: creds[c.name] ?? null,
      usageUrl: opts.usageUrl,
      usageToken: opts.usageToken,
    };
    // null allowedCommands = allow the server's full toolset (no restriction).
    if (c.allowedCommands) {
      for (const cmd of c.allowedCommands) allowTools.push(`mcp__${c.name}__${cmd}`);
    }
  }

  await mergeMcpServers(sandbox, handle, servers);
  await mergeCredFile(sandbox, handle, credPatch);
  await mergeSettings(sandbox, handle, allowTools);

  logger.info({ projectId: handle.projectId, count: connectors.length }, 'mcp.registry_wired');
  return connectors.length;
}
