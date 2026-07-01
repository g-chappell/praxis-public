// Decrypt the MCP connector credentials enabled for a project's template
// (STORY-50/TASK-148, ADR-0020). Runs in the Node web app (libsodium) and hands
// the plaintext to the orchestrator over the internal /sessions channel — the
// Bun orchestrator never holds the master key (ADR-0009), exactly like the
// Anthropic/OpenAI platform keys.

import { and, eq, isNotNull } from 'drizzle-orm';

import { decrypt } from '@praxis/crypto';
import { mcpConnectors, projects, templateMcpConnectors } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

/** {connectorName: plaintextCredential} for connectors enabled on the project's
 *  template that have a stored credential. Undecryptable rows are skipped. */
export async function connectorCredsForProject(
  projectId: string,
  database: Database = db,
): Promise<Record<string, string>> {
  const rows = await database
    .select({ name: mcpConnectors.name, enc: mcpConnectors.credentialsEncrypted })
    .from(projects)
    .innerJoin(templateMcpConnectors, eq(templateMcpConnectors.templateId, projects.templateId))
    .innerJoin(mcpConnectors, eq(mcpConnectors.id, templateMcpConnectors.connectorId))
    .where(
      and(
        eq(projects.id, projectId),
        eq(templateMcpConnectors.enabled, true),
        isNotNull(mcpConnectors.credentialsEncrypted),
      ),
    );

  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.enc) continue;
    try {
      out[r.name] = await decrypt(r.enc);
    } catch {
      // A credential we can't decrypt is skipped — the connector renders without it.
    }
  }
  return out;
}
