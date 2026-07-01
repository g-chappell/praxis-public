// Registry read-side (STORY-50/TASK-148). Real Postgres (gated by RUN_DB_TESTS):
// enabledConnectorsForTemplate resolves command_ref → baked wrapper, returns only
// rows enabled for the template, and drops unknown command_refs.

import { randomUUID } from 'node:crypto';

import { mcpConnectors, templateMcpConnectors } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';
import { describe, expect, it } from 'vitest';

import { enabledConnectorsForTemplate } from '../src/mcp-registry';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('enabledConnectorsForTemplate (real DB)', () => {
  it('returns enabled connectors resolved to their wrapper; skips disabled + unknown', async () => {
    await withDb(async (db) => {
      const template = `tpl-${randomUUID().slice(0, 8)}`;

      // A known connector enabled for the template.
      const [known] = await db
        .insert(mcpConnectors)
        .values({ name: `img-${randomUUID().slice(0, 6)}`, commandRef: 'image-gen' })
        .returning({ id: mcpConnectors.id, name: mcpConnectors.name });
      // A known connector enabled for a DIFFERENT template (must not appear).
      const [other] = await db
        .insert(mcpConnectors)
        .values({ name: `other-${randomUUID().slice(0, 6)}`, commandRef: 'image-gen' })
        .returning({ id: mcpConnectors.id });
      // A connector with an unknown command_ref, enabled (must be dropped).
      const [unknown] = await db
        .insert(mcpConnectors)
        .values({ name: `bad-${randomUUID().slice(0, 6)}`, commandRef: 'not-baked' })
        .returning({ id: mcpConnectors.id });

      await db.insert(templateMcpConnectors).values([
        { templateId: template, connectorId: known!.id, enabled: true, allowedCommands: ['x'] },
        { templateId: 'some-other-template', connectorId: other!.id, enabled: true },
        { templateId: template, connectorId: unknown!.id, enabled: true },
      ]);

      const result = await enabledConnectorsForTemplate(template, db);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe(known!.name);
      expect(result[0]!.command).toBe('praxis-mcp-image-gen'); // resolved from image-gen
      expect(result[0]!.allowedCommands).toEqual(['x']);
    });
  });

  it('excludes a connector disabled for the template', async () => {
    await withDb(async (db) => {
      const template = `tpl-${randomUUID().slice(0, 8)}`;
      const [c] = await db
        .insert(mcpConnectors)
        .values({ name: `c-${randomUUID().slice(0, 6)}`, commandRef: 'image-gen' })
        .returning({ id: mcpConnectors.id });
      await db
        .insert(templateMcpConnectors)
        .values({ templateId: template, connectorId: c!.id, enabled: false });
      expect(await enabledConnectorsForTemplate(template, db)).toHaveLength(0);
    });
  });
});
