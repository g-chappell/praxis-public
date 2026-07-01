#!/usr/bin/env node
// image-gen MCP server (STORY-15). Exposes a `generate_image` tool over stdio
// that Claude Code (in the sandbox) calls to create textures from a prompt,
// backed by the OpenAI Images API. Config (OpenAI key + usage endpoint/token) is
// resolved by ./config: the orchestrator delivers it via an ephemeral cred file
// outside /workspace (ADR-0018/TASK-044), with plain env vars as the local-run
// fallback. No secrets ever live in .mcp.json or the agent's spawn env.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import OpenAI from 'openai';
import { z } from 'zod';

import { resolveConfig } from './config.js';
import { generateImage, type ImagesClient } from './generate.js';
import { checkUsageAllowed } from './usage.js';

const cfg = resolveConfig(process.env);
const WORKSPACE_ROOT = cfg.workspaceRoot;
const TEXTURES_DIR = cfg.texturesDir;
const MODEL = cfg.model;
const USAGE_URL = cfg.usageUrl;
const USAGE_TOKEN = cfg.usageToken;

async function main(): Promise<void> {
  const apiKey = cfg.openaiApiKey;
  if (!apiKey) {
    // stdout is the JSON-RPC channel — diagnostics go to stderr only.
    console.error('[mcp-image-gen] no OpenAI API key configured; refusing to start');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey }) as unknown as ImagesClient;
  const server = new McpServer({ name: 'image-gen', version: '0.0.0' });

  server.registerTool(
    'generate_image',
    {
      title: 'Generate image',
      description:
        'Generate an image (e.g. a texture) from a text prompt and save it as a PNG in the project — by default under public/textures/. Returns the saved path so the scene can load it.',
      inputSchema: {
        prompt: z.string().describe('What to generate, e.g. "seamless mossy stone texture"'),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Requested width in px (default 1024)'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Requested height in px (default 1024)'),
        save_path: z
          .string()
          .optional()
          .describe(
            'Save location relative to the project root; defaults to public/textures/<slug>.png',
          ),
      },
    },
    async ({ prompt, width, height, save_path }) => {
      try {
        const usage = await checkUsageAllowed({
          url: USAGE_URL,
          token: USAGE_TOKEN,
          tool: 'generate_image',
        });
        if (!usage.allowed) {
          return {
            content: [{ type: 'text', text: `Image generation refused: ${usage.reason}` }],
            isError: true,
          };
        }
        const path = await generateImage(
          { prompt, width, height, save_path },
          { client, texturesDir: TEXTURES_DIR, workspaceRoot: WORKSPACE_ROOT, model: MODEL },
        );
        return { content: [{ type: 'text', text: `Saved image to ${path}` }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[mcp-image-gen] fatal', err);
  process.exit(1);
});
