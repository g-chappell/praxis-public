// Admin MCP connector registry CRUD (STORY-50, ADR-0020). Admin-scoped — gate on
// isUserAdmin at the route. Credentials are encrypted at rest via @praxis/crypto
// and NEVER returned plaintext (only a hasCredential flag). `command_ref` must be
// in the known allow-list (the orchestrator resolves it to a baked wrapper); an
// unknown ref is rejected here, never executed.

import { and, asc, eq } from 'drizzle-orm';

import { encrypt } from '@praxis/crypto';
import { mcpConnectors, templateMcpConnectors } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

// Keep in sync with the orchestrator's COMMAND_REF_WRAPPERS (mcp-registry.ts).
// Adding a connector type is "bake the wrapper into sandbox-base, then add it
// here" (ADR-0020) — not an admin typing a command.
export const KNOWN_COMMAND_REFS = ['image-gen'] as const;
export type CommandRef = (typeof KNOWN_COMMAND_REFS)[number];

export function isKnownCommandRef(v: unknown): v is CommandRef {
  return typeof v === 'string' && (KNOWN_COMMAND_REFS as readonly string[]).includes(v);
}

export interface ConnectorSummary {
  id: string;
  name: string;
  commandRef: string;
  args: unknown;
  usageCap: number | null;
  hasCredential: boolean;
  createdAt: Date | null;
}

export interface TemplateEnablement {
  templateId: string;
  enabled: boolean;
  allowedCommands: string[] | null;
}

export interface ConnectorDetail extends ConnectorSummary {
  templates: TemplateEnablement[];
}

function toSummary(r: {
  id: string;
  name: string;
  commandRef: string;
  args: unknown;
  usageCap: number | null;
  credentialsEncrypted: string | null;
  createdAt: Date | null;
}): ConnectorSummary {
  return {
    id: r.id,
    name: r.name,
    commandRef: r.commandRef,
    args: r.args,
    usageCap: r.usageCap,
    hasCredential: r.credentialsEncrypted !== null,
    createdAt: r.createdAt,
  };
}

/** The catalog with each connector's per-template enablement (for the admin UI).
 *  Credentials are never included — only the hasCredential flag. */
export async function listConnectors(database: Database = db): Promise<ConnectorDetail[]> {
  const rows = await database.select().from(mcpConnectors).orderBy(asc(mcpConnectors.name));
  const enablements = await database
    .select({
      connectorId: templateMcpConnectors.connectorId,
      templateId: templateMcpConnectors.templateId,
      enabled: templateMcpConnectors.enabled,
      allowedCommands: templateMcpConnectors.allowedCommands,
    })
    .from(templateMcpConnectors);
  const byConnector = new Map<string, TemplateEnablement[]>();
  for (const e of enablements) {
    const list = byConnector.get(e.connectorId) ?? [];
    list.push({
      templateId: e.templateId,
      enabled: e.enabled,
      allowedCommands: (e.allowedCommands as string[] | null) ?? null,
    });
    byConnector.set(e.connectorId, list);
  }
  return rows.map((r) => ({ ...toSummary(r), templates: byConnector.get(r.id) ?? [] }));
}

export async function getConnectorDetail(
  id: string,
  database: Database = db,
): Promise<ConnectorDetail | null> {
  const [row] = await database
    .select()
    .from(mcpConnectors)
    .where(eq(mcpConnectors.id, id))
    .limit(1);
  if (!row) return null;
  const templates = await database
    .select({
      templateId: templateMcpConnectors.templateId,
      enabled: templateMcpConnectors.enabled,
      allowedCommands: templateMcpConnectors.allowedCommands,
    })
    .from(templateMcpConnectors)
    .where(eq(templateMcpConnectors.connectorId, id))
    .orderBy(asc(templateMcpConnectors.templateId));
  return {
    ...toSummary(row),
    templates: templates.map((t) => ({
      templateId: t.templateId,
      enabled: t.enabled,
      allowedCommands: (t.allowedCommands as string[] | null) ?? null,
    })),
  };
}

/** Create a catalog connector. Returns the new id, or an error code (name taken /
 *  invalid command_ref). The credential (when given) is encrypted before insert. */
export async function createConnector(
  input: {
    name: string;
    commandRef: string;
    args?: unknown;
    usageCap?: number | null;
    credential?: string | null;
  },
  createdBy: string,
  database: Database = db,
): Promise<{ id: string } | { error: 'name_taken' | 'invalid_command_ref' }> {
  if (!isKnownCommandRef(input.commandRef)) return { error: 'invalid_command_ref' };
  const credentialsEncrypted = input.credential ? await encrypt(input.credential) : null;
  const [row] = await database
    .insert(mcpConnectors)
    .values({
      name: input.name,
      commandRef: input.commandRef,
      args: input.args ?? null,
      usageCap: input.usageCap ?? null,
      credentialsEncrypted,
      createdBy,
    })
    .onConflictDoNothing({ target: mcpConnectors.name })
    .returning({ id: mcpConnectors.id });
  return row ? { id: row.id } : { error: 'name_taken' };
}

/** Update a connector. Only provided fields change; passing `credential` re-encrypts
 *  (null clears it). Returns false when the connector doesn't exist. */
export async function updateConnector(
  id: string,
  input: { args?: unknown; usageCap?: number | null; credential?: string | null },
  database: Database = db,
): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  if (input.args !== undefined) patch.args = input.args;
  if (input.usageCap !== undefined) patch.usageCap = input.usageCap;
  if (input.credential !== undefined) {
    patch.credentialsEncrypted = input.credential ? await encrypt(input.credential) : null;
  }
  if (Object.keys(patch).length === 0) return true;
  const [row] = await database
    .update(mcpConnectors)
    .set(patch)
    .where(eq(mcpConnectors.id, id))
    .returning({ id: mcpConnectors.id });
  return Boolean(row);
}

export async function deleteConnector(id: string, database: Database = db): Promise<boolean> {
  const [row] = await database
    .delete(mcpConnectors)
    .where(eq(mcpConnectors.id, id))
    .returning({ id: mcpConnectors.id });
  return Boolean(row);
}

/** Enable/disable a connector for a template + set its allowed commands (upsert).
 *  Returns false when the connector doesn't exist. */
export async function setTemplateConnector(
  connectorId: string,
  templateId: string,
  input: { enabled: boolean; allowedCommands?: string[] | null },
  database: Database = db,
): Promise<boolean> {
  const [connector] = await database
    .select({ id: mcpConnectors.id })
    .from(mcpConnectors)
    .where(eq(mcpConnectors.id, connectorId))
    .limit(1);
  if (!connector) return false;

  await database
    .insert(templateMcpConnectors)
    .values({
      templateId,
      connectorId,
      enabled: input.enabled,
      allowedCommands: input.allowedCommands ?? null,
    })
    .onConflictDoUpdate({
      target: [templateMcpConnectors.templateId, templateMcpConnectors.connectorId],
      set: { enabled: input.enabled, allowedCommands: input.allowedCommands ?? null },
    });
  return true;
}

/** Remove a template enablement row entirely. */
export async function removeTemplateConnector(
  connectorId: string,
  templateId: string,
  database: Database = db,
): Promise<void> {
  await database
    .delete(templateMcpConnectors)
    .where(
      and(
        eq(templateMcpConnectors.connectorId, connectorId),
        eq(templateMcpConnectors.templateId, templateId),
      ),
    );
}
