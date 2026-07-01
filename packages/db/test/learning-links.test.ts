import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { LEARNING_LINKS, seedLearningLinks } from '../seeds/learning-links.js';
import { learningLinks } from '../src/schema.js';
import { dbTestsEnabled, withDb } from '../src/test/with-db.js';

// STORY-17 AC: ≥10 entries spanning ACP, MCP, Three.js, git, and agentic-prompting.
const REQUIRED_TOPICS = ['ACP', 'MCP', 'Three.js', 'git', 'agentic prompting'];

describe('LEARNING_LINKS seed data', () => {
  it('has at least 10 curated entries', () => {
    expect(LEARNING_LINKS.length).toBeGreaterThanOrEqual(10);
  });

  it('spans every required topic', () => {
    const topics = new Set(LEARNING_LINKS.map((l) => l.topic));
    for (const topic of REQUIRED_TOPICS) {
      expect(topics.has(topic)).toBe(true);
    }
  });

  it('every entry has a title, source, topic, and an http(s) url', () => {
    for (const link of LEARNING_LINKS) {
      expect(link.title.trim()).not.toBe('');
      expect(link.source.trim()).not.toBe('');
      expect(link.topic.trim()).not.toBe('');
      expect(link.url).toMatch(/^https?:\/\//);
    }
  });

  it('has unique urls so the seed is dedupe-safe', () => {
    const urls = LEARNING_LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe.skipIf(!dbTestsEnabled())('seedLearningLinks (DB)', () => {
  it('inserts ≥10 rows and is idempotent across re-runs', async () => {
    await withDb(async (db) => {
      const first = await seedLearningLinks(db);
      const second = await seedLearningLinks(db);

      // The second run inserts nothing new — everything is already present.
      expect(second.inserted).toBe(0);
      expect(first.inserted + first.skipped).toBe(LEARNING_LINKS.length);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(learningLinks);
      expect(count).toBeGreaterThanOrEqual(10);
    });
  });
});
