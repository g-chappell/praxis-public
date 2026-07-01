import { describe, expect, it, vi } from 'vitest';

import { resolveConfig } from './config.js';

describe('resolveConfig (TASK-044)', () => {
  it('falls back to env when PRAXIS_MCP_CONFIG is unset', () => {
    const readFile = vi.fn();
    const cfg = resolveConfig(
      {
        OPENAI_API_KEY: 'sk-env',
        PRAXIS_MCP_USAGE_URL: 'http://orch/usage',
        PRAXIS_MCP_TOKEN: 'tok-env',
      } as NodeJS.ProcessEnv,
      readFile,
    );
    expect(cfg.openaiApiKey).toBe('sk-env');
    expect(cfg.usageUrl).toBe('http://orch/usage');
    expect(cfg.usageToken).toBe('tok-env');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads the cred file and lets it win over env', () => {
    const readFile = vi.fn().mockReturnValue(
      JSON.stringify({
        openaiApiKey: 'sk-file',
        usageUrl: 'http://file/usage',
        usageToken: 'tok-file',
      }),
    );
    const cfg = resolveConfig(
      {
        PRAXIS_MCP_CONFIG: '/run/praxis-mcp/config.json',
        OPENAI_API_KEY: 'sk-env',
        PRAXIS_MCP_TOKEN: 'tok-env',
      } as NodeJS.ProcessEnv,
      readFile,
    );
    expect(readFile).toHaveBeenCalledWith('/run/praxis-mcp/config.json');
    expect(cfg.openaiApiKey).toBe('sk-file');
    expect(cfg.usageUrl).toBe('http://file/usage');
    expect(cfg.usageToken).toBe('tok-file');
  });

  it('falls through to env when the cred file is unreadable or malformed (no throw)', () => {
    const throwing = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const env = {
      PRAXIS_MCP_CONFIG: '/run/praxis-mcp/config.json',
      OPENAI_API_KEY: 'sk-env',
    } as NodeJS.ProcessEnv;
    expect(resolveConfig(env, throwing).openaiApiKey).toBe('sk-env');

    const malformed = vi.fn().mockReturnValue('{ not json');
    expect(resolveConfig(env, malformed).openaiApiKey).toBe('sk-env');
  });

  it('applies defaults for workspaceRoot, texturesDir, and model', () => {
    const cfg = resolveConfig({} as NodeJS.ProcessEnv, vi.fn());
    expect(cfg.workspaceRoot).toBe('/workspace');
    expect(cfg.texturesDir).toBe('/workspace/public/textures');
    expect(cfg.model).toBe('gpt-image-1');
    expect(cfg.openaiApiKey).toBeUndefined();
  });

  it('derives texturesDir from a custom workspaceRoot', () => {
    const cfg = resolveConfig({ PRAXIS_WORKSPACE_ROOT: '/srv/app' } as NodeJS.ProcessEnv, vi.fn());
    expect(cfg.texturesDir).toBe('/srv/app/public/textures');
  });
});
