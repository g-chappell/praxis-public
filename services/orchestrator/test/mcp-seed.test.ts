import { describe, expect, it } from 'vitest';

import type { SandboxHandle } from '@praxis/sandbox';

import { MCP_CRED_PATH, seedImageGenMcp } from '../src/mcp-seed';

const handle: SandboxHandle = { projectId: 'proj-1', containerId: 'c1' };

/** A fake sandbox capturing writeFile calls; readFile defaults to "no file". */
function fakeSandbox(existingFiles: Record<string, string> = {}) {
  const writes: Array<{ path: string; content: string }> = [];
  return {
    writes,
    async writeFile(_h: SandboxHandle, path: string, content: string) {
      writes.push({ path, content });
    },
    async readFile(_h: SandboxHandle, path: string) {
      if (path in existingFiles) return existingFiles[path]!;
      throw new Error('file not found');
    },
  };
}

describe('seedImageGenMcp (TASK-044)', () => {
  it('writes settings, .mcp.json, and the cred file when an OpenAI key is present', async () => {
    const sb = fakeSandbox();
    const result = await seedImageGenMcp(sb, handle, {
      openaiKey: 'sk-secret',
      usageToken: 'tok-123',
      usageUrl: 'http://praxis-orchestrator:4001/internal/mcp/usage',
    });
    expect(result).toBe(true);

    const byPath = Object.fromEntries(sb.writes.map((w) => [w.path, w.content]));
    expect(Object.keys(byPath).sort()).toEqual([
      '.claude/settings.json',
      '.mcp.json',
      MCP_CRED_PATH,
    ]);

    // settings.json enables project MCP servers.
    expect(JSON.parse(byPath['.claude/settings.json']!)).toMatchObject({
      enableAllProjectMcpServers: true,
    });

    // .mcp.json declares the server but carries NO secret.
    const mcp = JSON.parse(byPath['.mcp.json']!);
    expect(mcp.mcpServers['image-gen'].command).toBe('praxis-mcp-image-gen');
    expect(mcp.mcpServers['image-gen'].env.PRAXIS_MCP_CONFIG).toBe(MCP_CRED_PATH);
    expect(byPath['.mcp.json']).not.toContain('sk-secret');
    expect(byPath['.mcp.json']).not.toContain('tok-123');

    // The cred file holds the secrets and lives OUTSIDE /workspace (absolute path).
    expect(MCP_CRED_PATH.startsWith('/')).toBe(true);
    expect(MCP_CRED_PATH.startsWith('/workspace')).toBe(false);
    const cred = JSON.parse(byPath[MCP_CRED_PATH]!);
    expect(cred).toEqual({
      openaiApiKey: 'sk-secret',
      usageUrl: 'http://praxis-orchestrator:4001/internal/mcp/usage',
      usageToken: 'tok-123',
    });
  });

  it('writes nothing and returns false when no OpenAI key is configured', async () => {
    const sb = fakeSandbox();
    const result = await seedImageGenMcp(sb, handle, {
      openaiKey: undefined,
      usageToken: 'tok-123',
      usageUrl: 'http://orch/usage',
    });
    expect(result).toBe(false);
    expect(sb.writes).toHaveLength(0);
  });

  it('read-merges existing settings instead of clobbering them', async () => {
    const sb = fakeSandbox({
      '.claude/settings.json': JSON.stringify({ theme: 'dark', enableAllProjectMcpServers: false }),
    });
    await seedImageGenMcp(sb, handle, {
      openaiKey: 'sk',
      usageToken: 't',
      usageUrl: 'http://orch/usage',
    });
    const settings = JSON.parse(sb.writes.find((w) => w.path === '.claude/settings.json')!.content);
    expect(settings).toEqual({ theme: 'dark', enableAllProjectMcpServers: true });
  });
});
