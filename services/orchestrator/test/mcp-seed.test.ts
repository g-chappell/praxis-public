import { describe, expect, it } from 'vitest';

import type { SandboxHandle } from '@praxis/sandbox';

import type { EnabledConnector } from '../src/mcp-registry';
import { MCP_CRED_PATH, seedImageGenMcp, seedRegistryConnectors } from '../src/mcp-seed';

const handle: SandboxHandle = { projectId: 'proj-1', containerId: 'c1' };

/** A STATEFUL fake: writeFile updates the file map so a later read-merge sees
 *  prior writes (needed to prove image-gen + registry connectors coexist). */
function statefulSandbox(files: Record<string, string> = {}) {
  return {
    files,
    async writeFile(_h: SandboxHandle, path: string, content: string) {
      files[path] = content;
    },
    async readFile(_h: SandboxHandle, path: string) {
      if (path in files) return files[path]!;
      throw new Error('file not found');
    },
  };
}

const CONNECTOR: EnabledConnector = {
  name: 'docs-search',
  command: 'praxis-mcp-docs',
  args: ['--mode', 'ro'],
  allowedCommands: ['search'],
  usageCap: 10,
};

describe('seedRegistryConnectors (TASK-148)', () => {
  it('renders .mcp.json, cred sections, and allowed-command permissions', async () => {
    const sb = statefulSandbox();
    const n = await seedRegistryConnectors(
      sb,
      handle,
      [CONNECTOR],
      { 'docs-search': 'sk-docs' },
      {
        usageUrl: 'http://orch/usage',
        usageToken: 'tok',
      },
    );
    expect(n).toBe(1);

    const mcp = JSON.parse(sb.files['.mcp.json']!);
    expect(mcp.mcpServers['docs-search']).toEqual({
      command: 'praxis-mcp-docs',
      args: ['--mode', 'ro'],
      env: { PRAXIS_MCP_CONFIG: MCP_CRED_PATH, PRAXIS_WORKSPACE_ROOT: '/workspace' },
    });
    const cred = JSON.parse(sb.files[MCP_CRED_PATH]!);
    expect(cred['docs-search']).toEqual({
      credential: 'sk-docs',
      usageUrl: 'http://orch/usage',
      usageToken: 'tok',
    });
    const settings = JSON.parse(sb.files['.claude/settings.json']!);
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.permissions.allow).toContain('mcp__docs-search__search');
  });

  it('null allowedCommands → no permission restriction', async () => {
    const sb = statefulSandbox();
    await seedRegistryConnectors(
      sb,
      handle,
      [{ ...CONNECTOR, allowedCommands: null }],
      {},
      { usageUrl: 'u', usageToken: 't' },
    );
    const settings = JSON.parse(sb.files['.claude/settings.json']!);
    expect(settings.permissions).toBeUndefined(); // no allow-list added
  });

  it('coexists with image-gen via read-merge (both servers + both creds)', async () => {
    const sb = statefulSandbox();
    await seedImageGenMcp(sb, handle, { openaiKey: 'sk-oai', usageToken: 't', usageUrl: 'u' });
    await seedRegistryConnectors(
      sb,
      handle,
      [CONNECTOR],
      { 'docs-search': 'sk-docs' },
      {
        usageUrl: 'u',
        usageToken: 't',
      },
    );

    const mcp = JSON.parse(sb.files['.mcp.json']!);
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['docs-search', 'image-gen']);
    const cred = JSON.parse(sb.files[MCP_CRED_PATH]!);
    expect(cred.openaiApiKey).toBe('sk-oai'); // image-gen flat fields preserved
    expect(cred['docs-search'].credential).toBe('sk-docs'); // registry section added
  });

  it('writes nothing for an empty connector list', async () => {
    const sb = statefulSandbox();
    expect(
      await seedRegistryConnectors(sb, handle, [], {}, { usageUrl: 'u', usageToken: 't' }),
    ).toBe(0);
    expect(Object.keys(sb.files)).toHaveLength(0);
  });
});

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
