// Persistence tests for the MCP connector registry CRUD (STORY-50, ADR-0020).
// Real Postgres (tier-3) + real @praxis/crypto, gated behind RUN_DB_TESTS=1.

import { randomUUID } from 'node:crypto';

import { _resetKeyCacheForTests, decrypt } from '@praxis/crypto';
import { mcpConnectors, users } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createConnector,
  deleteConnector,
  getConnectorDetail,
  listConnectors,
  setTemplateConnector,
  updateConnector,
} from './admin-connectors';

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('admin-connectors CRUD (real DB + crypto)', () => {
  beforeAll(() => {
    process.env.PRAXIS_MASTER_KEY = TEST_KEY;
    _resetKeyCacheForTests();
  });

  it('creates with an ENCRYPTED credential (never plaintext); lists without it', async () => {
    await withDb(async (db) => {
      const [admin] = await db
        .insert(users)
        .values({ email: `con-${randomUUID()}@example.test`, role: 'admin' })
        .returning({ id: users.id });
      const name = `img-${randomUUID().slice(0, 8)}`;
      const secret = 'sk-super-secret-value';

      const res = await createConnector(
        { name, commandRef: 'image-gen', usageCap: 50, credential: secret },
        admin!.id,
        db,
      );
      expect('id' in res).toBe(true);
      const id = (res as { id: string }).id;

      // Stored ciphertext is NOT the plaintext, and decrypts back to it.
      const [row] = await db
        .select({ enc: mcpConnectors.credentialsEncrypted })
        .from(mcpConnectors)
        .where(eq(mcpConnectors.id, id));
      expect(row!.enc).not.toBeNull();
      expect(row!.enc).not.toContain(secret);
      expect(await decrypt(row!.enc!)).toBe(secret);

      // The list surfaces hasCredential but no ciphertext/plaintext.
      const listed = (await listConnectors(db)).find((c) => c.id === id)!;
      expect(listed.hasCredential).toBe(true);
      expect(JSON.stringify(listed)).not.toContain(secret);
    });
  });

  it('rejects an unknown command_ref and a duplicate name', async () => {
    await withDb(async (db) => {
      const [admin] = await db
        .insert(users)
        .values({ email: `con2-${randomUUID()}@example.test` })
        .returning({ id: users.id });
      expect(
        await createConnector({ name: `x-${randomUUID()}`, commandRef: 'evil' }, admin!.id, db),
      ).toEqual({ error: 'invalid_command_ref' });

      const name = `dupe-${randomUUID().slice(0, 8)}`;
      await createConnector({ name, commandRef: 'image-gen' }, admin!.id, db);
      expect(await createConnector({ name, commandRef: 'image-gen' }, admin!.id, db)).toEqual({
        error: 'name_taken',
      });
    });
  });

  it('enables per-template + reads detail; updates + deletes', async () => {
    await withDb(async (db) => {
      const [admin] = await db
        .insert(users)
        .values({ email: `con3-${randomUUID()}@example.test` })
        .returning({ id: users.id });
      const created = await createConnector(
        { name: `c-${randomUUID().slice(0, 8)}`, commandRef: 'image-gen' },
        admin!.id,
        db,
      );
      const id = (created as { id: string }).id;

      expect(
        await setTemplateConnector(
          id,
          'react-threejs-scene',
          { enabled: true, allowedCommands: ['generate_image'] },
          db,
        ),
      ).toBe(true);
      const detail = await getConnectorDetail(id, db);
      expect(detail!.templates).toEqual([
        { templateId: 'react-threejs-scene', enabled: true, allowedCommands: ['generate_image'] },
      ]);

      expect(await updateConnector(id, { usageCap: 5 }, db)).toBe(true);
      expect((await getConnectorDetail(id, db))!.usageCap).toBe(5);

      expect(await deleteConnector(id, db)).toBe(true);
      expect(await getConnectorDetail(id, db)).toBeNull();
      // setTemplateConnector on a missing connector → false.
      expect(await setTemplateConnector(randomUUID(), 'blank', { enabled: true }, db)).toBe(false);
    });
  });
});
