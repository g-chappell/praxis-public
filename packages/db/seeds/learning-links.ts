// Curated learning links surfaced in the workspace learning panel (STORY-17).
// Each entry is a stable, primary-source URL grouped by `topic`; the panel groups
// cards by that topic. Idempotent by `url`: re-running inserts only links not
// already present, so a fresh `db:migrate && db:seed:learning-links` reproduces
// the set on any rebuild without duplicating rows (the table has no unique index
// on url, so we dedupe in the seed rather than relying on onConflict).

import { inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import * as schema from '../src/schema.js';
import { learningLinks } from '../src/schema.js';

type Db = PostgresJsDatabase<typeof schema>;

export interface SeedLink {
  title: string;
  url: string;
  topic: string;
  source: string;
}

// ≥10 entries spanning ACP, MCP, Three.js, git, and agentic-prompting (STORY-17
// AC), plus the template's other building blocks (image gen, Caddy TLS, auth).
export const LEARNING_LINKS: readonly SeedLink[] = [
  {
    title: 'Agent Client Protocol — overview',
    url: 'https://agentclientprotocol.com/overview/introduction',
    topic: 'ACP',
    source: 'Agent Client Protocol',
  },
  {
    title: 'Model Context Protocol — introduction',
    url: 'https://modelcontextprotocol.io/introduction',
    topic: 'MCP',
    source: 'Anthropic',
  },
  {
    title: 'MCP reference servers',
    url: 'https://github.com/modelcontextprotocol/servers',
    topic: 'MCP',
    source: 'Model Context Protocol',
  },
  {
    title: 'three.js — documentation & manual',
    url: 'https://threejs.org/docs/',
    topic: 'Three.js',
    source: 'three.js',
  },
  {
    title: 'drei — helpers for react-three-fiber',
    url: 'https://github.com/pmndrs/drei',
    topic: 'Three.js',
    source: 'pmndrs',
  },
  {
    title: 'React Three Fiber — getting started',
    url: 'https://r3f.docs.pmnd.rs/getting-started/introduction',
    topic: 'react-three-fiber',
    source: 'pmndrs',
  },
  {
    title: 'OpenAI Images API — generate images',
    url: 'https://platform.openai.com/docs/guides/images',
    topic: 'OpenAI image API',
    source: 'OpenAI',
  },
  {
    title: 'Pro Git — git basics',
    url: 'https://git-scm.com/book/en/v2/Git-Basics-Getting-a-Git-Repository',
    topic: 'git',
    source: 'Pro Git',
  },
  {
    title: 'GitHub — Hello World walkthrough',
    url: 'https://docs.github.com/en/get-started/start-your-journey/hello-world',
    topic: 'git',
    source: 'GitHub Docs',
  },
  {
    title: 'Claude Code best practices for agentic coding',
    url: 'https://www.anthropic.com/engineering/claude-code-best-practices',
    topic: 'agentic prompting',
    source: 'Anthropic',
  },
  {
    title: 'Prompt engineering overview',
    url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview',
    topic: 'agentic prompting',
    source: 'Anthropic',
  },
  {
    title: 'Anthropic Cookbook — runnable samples',
    url: 'https://github.com/anthropics/anthropic-cookbook',
    topic: 'Cookbook',
    source: 'Anthropic',
  },
];

/** Insert any curated links not already present (matched by url). Idempotent:
 *  returns how many rows were inserted vs skipped because they already existed. */
export async function seedLearningLinks(db: Db): Promise<{ inserted: number; skipped: number }> {
  const urls = LEARNING_LINKS.map((l) => l.url);
  const existing = await db
    .select({ url: learningLinks.url })
    .from(learningLinks)
    .where(inArray(learningLinks.url, urls));
  const have = new Set(existing.map((r) => r.url));
  const missing = LEARNING_LINKS.filter((l) => !have.has(l.url));
  if (missing.length > 0) {
    await db.insert(learningLinks).values(missing);
  }
  return { inserted: missing.length, skipped: LEARNING_LINKS.length - missing.length };
}
