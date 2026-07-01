// Persistence test for connector credential decryption (STORY-50/TASK-148). Real
// Postgres + real @praxis/crypto, gated by RUN_DB_TESTS=1.

import { randomUUID } from 'node:crypto';

import { _resetKeyCacheForTests, encrypt } from '@praxis/crypto';
import {
  mcpConnectors,
  projects,
  teamMemberships,
  teams,
  templateMcpConnectors,
  users,
} from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';
import { beforeAll, describe, expect, it } from 'vitest';

import { connectorCredsForProject } from './connector-creds';

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('connectorCredsForProject (real DB + crypto)', () => {
  beforeAll(() => {
    process.env.PRAXIS_MASTER_KEY = TEST_KEY;
    _resetKeyCacheForTests();
  });

  it('decrypts only the credentials of connectors enabled for the project template', async () => {
    await withDb(async (db) => {
      const template = `tpl-${randomUUID().slice(0, 8)}`;
      const [owner] = await db
        .insert(users)
        .values({ email: `cc-${randomUUID()}@example.test` })
        .returning({ id: users.id });
      const [team] = await db
        .insert(teams)
        .values({ name: 't', createdBy: owner!.id })
        .returning({ id: teams.id });
      await db.insert(teamMemberships).values({ teamId: team!.id, userId: owner!.id });
      const [project] = await db
        .insert(projects)
        .values({ teamId: team!.id, name: 'p', templateId: template, createdBy: owner!.id })
        .returning({ id: projects.id });

      const enabled = await db
        .insert(mcpConnectors)
        .values({
          name: `on-${randomUUID().slice(0, 6)}`,
          commandRef: 'image-gen',
          credentialsEncrypted: await encrypt('secret-ON'),
        })
        .returning({ id: mcpConnectors.id, name: mcpConnectors.name });
      const disabled = await db
        .insert(mcpConnectors)
        .values({
          name: `off-${randomUUID().slice(0, 6)}`,
          commandRef: 'image-gen',
          credentialsEncrypted: await encrypt('secret-OFF'),
        })
        .returning({ id: mcpConnectors.id, name: mcpConnectors.name });

      await db.insert(templateMcpConnectors).values([
        { templateId: template, connectorId: enabled[0]!.id, enabled: true },
        { templateId: template, connectorId: disabled[0]!.id, enabled: false },
      ]);

      const creds = await connectorCredsForProject(project!.id, db);
      expect(creds[enabled[0]!.name]).toBe('secret-ON'); // decrypted plaintext
      expect(creds[disabled[0]!.name]).toBeUndefined(); // disabled → excluded
    });
  });
});
