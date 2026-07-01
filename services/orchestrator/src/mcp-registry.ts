// MCP connector registry — orchestrator read side (STORY-50/TASK-148, ADR-0020).
// Bun-safe: this only reads the NON-secret connector config from the DB; the
// secret credentials are decrypted web-side and passed into POST /sessions (like
// openaiKey, ADR-0009 — the orchestrator never holds the master key).

import { and, eq } from 'drizzle-orm';

import { mcpConnectors, templateMcpConnectors } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

// `command_ref` → the wrapper baked into sandbox-base. The allow-list is the
// security boundary (ADR-0020): an admin registers a row referencing a known
// wrapper; they never supply a command. Keep in sync with the web's
// KNOWN_COMMAND_REFS (lib/admin-connectors.ts).
export const COMMAND_REF_WRAPPERS: Record<string, string> = {
  'image-gen': 'praxis-mcp-image-gen',
};

export interface EnabledConnector {
  name: string;
  /** The baked wrapper command for this connector's command_ref. */
  command: string;
  args: string[];
  /** Permitted tool subset for this template (null = all the server exposes). */
  allowedCommands: string[] | null;
  usageCap: number | null;
}

/** Connectors enabled for a template, resolved to their baked wrapper command.
 *  Rows whose `command_ref` isn't in the allow-list are dropped (clean degrade —
 *  never executed). The `database` is injectable for tests. */
export async function enabledConnectorsForTemplate(
  templateId: string,
  database: Database = db,
): Promise<EnabledConnector[]> {
  const rows = await database
    .select({
      name: mcpConnectors.name,
      commandRef: mcpConnectors.commandRef,
      args: mcpConnectors.args,
      usageCap: mcpConnectors.usageCap,
      allowedCommands: templateMcpConnectors.allowedCommands,
    })
    .from(templateMcpConnectors)
    .innerJoin(mcpConnectors, eq(mcpConnectors.id, templateMcpConnectors.connectorId))
    .where(
      and(
        eq(templateMcpConnectors.templateId, templateId),
        eq(templateMcpConnectors.enabled, true),
      ),
    );

  const out: EnabledConnector[] = [];
  for (const r of rows) {
    const command = COMMAND_REF_WRAPPERS[r.commandRef];
    if (!command) continue; // unknown wrapper → not rendered
    out.push({
      name: r.name,
      command,
      args: Array.isArray(r.args) ? (r.args as string[]) : [],
      allowedCommands: (r.allowedCommands as string[] | null) ?? null,
      usageCap: r.usageCap,
    });
  }
  return out;
}
