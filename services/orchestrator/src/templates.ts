// Read a template's runtime config from the shipped template sources
// (templatesDir/<templateId>/{sandbox.json,template.json}). Used to know the
// preview port and (PR2) the dev command to auto-start. Mirrors the templatesDir
// the sandbox seeds from (ADR-0014).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TemplateConfig {
  previewPort: number;
  /** Install step, e.g. `npm install` (from sandbox.json). */
  setup?: string;
  /** Dev-server command, e.g. `npm run dev` (from sandbox.json). */
  dev?: string;
  /** MCP servers this template opts into (from template.json `mcp_servers`),
   *  e.g. `["image-gen"]`. The orchestrator only wires a server when the
   *  template declares it (STORY-15/TASK-044). */
  mcpServers: string[];
}

function templatesDir(): string {
  return process.env.PRAXIS_TEMPLATES_DIR ?? '/app/templates';
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function readTemplateConfig(templateId: string): TemplateConfig {
  const dir = join(templatesDir(), templateId);
  const sandbox = readJson(join(dir, 'sandbox.json'));
  const template = readJson(join(dir, 'template.json'));
  const port =
    (typeof sandbox.preview_port === 'number' ? sandbox.preview_port : undefined) ??
    (typeof template.preview_port === 'number' ? template.preview_port : undefined) ??
    5173;
  return {
    previewPort: port,
    setup: typeof sandbox.setup === 'string' ? sandbox.setup : undefined,
    dev: typeof sandbox.dev === 'string' ? sandbox.dev : undefined,
    mcpServers: Array.isArray(template.mcp_servers)
      ? template.mcp_servers.filter((s): s is string => typeof s === 'string')
      : [],
  };
}
