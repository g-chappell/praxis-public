// Platform API key management (ADR-0009 / STORY-21 / STORY-38). The
// platform-owned keys that power agent sessions live encrypted in
// platform_api_keys, keyed by provider — Anthropic for inference, OpenAI for the
// image-gen MCP server. This module is the only place that encrypts on write and
// decrypts on read. One key is active per provider — setting a new one
// deactivates the prior for that provider (retained for audit).
//
// Lives in @praxis/keys (not apps/web/lib) so both the web admin UI and the
// orchestrator (which calls getActivePlatformKey at agent-spawn time, STORY-09)
// can import it.

import { and, eq } from 'drizzle-orm';

import { decrypt, encrypt } from '@praxis/crypto';
import { platformApiKeys } from '@praxis/db';
import { type Database, db as defaultDb } from '@praxis/db/client';

/** Which provider a platform key belongs to. Anthropic is the default for all
 *  existing callers; OpenAI was added in STORY-38. */
export type KeyProvider = 'anthropic' | 'openai';

/** Thrown by getActivePlatformKey when no active key is configured. Loud on
 *  purpose — a session cannot run without it (ADR-0009). */
export class NoPlatformKeyError extends Error {
  constructor() {
    super('No active platform API key is configured');
    this.name = 'NoPlatformKeyError';
  }
}

/** Display-safe metadata about the active key. Never carries the raw key. */
export interface PlatformKeyMeta {
  maskedKey: string;
  createdAt: Date | null;
  lastRotatedAt: Date | null;
}

/** Mask a key for display: keep the provider prefix and last 4, hide the rest.
 *  e.g. `sk-ant-…AB12`. Pure (no I/O) so it's unit-testable. */
export function maskKey(raw: string): string {
  const last4 = raw.slice(-4);
  if (raw.length <= 8) return `…${last4}`;
  return `${raw.slice(0, 7)}…${last4}`;
}

/**
 * Set the active platform API key for a provider (first-set or rotation). In one
 * transaction: deactivate the current active key for that provider (kept for
 * audit), then insert the new one as active. The raw key is encrypted before it
 * touches the DB and never logged. Defaults to 'anthropic' so existing callers
 * are unchanged.
 */
export async function setActivePlatformKey(
  rawKey: string,
  createdById: string,
  provider: KeyProvider = 'anthropic',
  db: Database = defaultDb,
): Promise<void> {
  const keyEncrypted = await encrypt(rawKey);
  await db.transaction(async (tx) => {
    await tx
      .update(platformApiKeys)
      .set({ active: false })
      .where(and(eq(platformApiKeys.active, true), eq(platformApiKeys.provider, provider)));
    await tx.insert(platformApiKeys).values({
      keyEncrypted,
      provider,
      active: true,
      createdBy: createdById,
      lastRotatedAt: new Date(),
    });
  });
}

/**
 * Return the decrypted active platform API key for a provider, for server-side
 * consumers (the orchestrator at agent-spawn time). Throws
 * {@link NoPlatformKeyError} when none is configured — callers that treat the
 * key as optional (e.g. OpenAI) should use {@link tryGetActivePlatformKey}
 * instead. Defaults to 'anthropic'. Server-side only — never expose to a client.
 */
export async function getActivePlatformKey(
  provider: KeyProvider = 'anthropic',
  db: Database = defaultDb,
): Promise<string> {
  const [row] = await db
    .select()
    .from(platformApiKeys)
    .where(and(eq(platformApiKeys.active, true), eq(platformApiKeys.provider, provider)))
    .limit(1);
  if (!row) throw new NoPlatformKeyError();
  return decrypt(row.keyEncrypted);
}

/**
 * Like {@link getActivePlatformKey} but returns null instead of throwing when no
 * active key is configured for the provider. For optional providers (OpenAI):
 * absent key → feature unavailable, never a hard failure (STORY-38). Server-side
 * only — never expose the result to a client.
 */
export async function tryGetActivePlatformKey(
  provider: KeyProvider,
  db: Database = defaultDb,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(platformApiKeys)
    .where(and(eq(platformApiKeys.active, true), eq(platformApiKeys.provider, provider)))
    .limit(1);
  if (!row) return null;
  return decrypt(row.keyEncrypted);
}

/** Deactivate the active platform key for a provider (no-op when none active).
 *  The row is retained for audit. Deactivating 'anthropic' stops all agent
 *  sessions until a new key is set (the caller is expected to confirm). */
export async function deactivateActivePlatformKey(
  provider: KeyProvider,
  db: Database = defaultDb,
): Promise<void> {
  await db
    .update(platformApiKeys)
    .set({ active: false })
    .where(and(eq(platformApiKeys.active, true), eq(platformApiKeys.provider, provider)));
}

/** Display-safe metadata for a provider's active key, or null when none is set.
 *  Decrypts only to compute the mask; never returns the raw key. Defaults to
 *  'anthropic'. */
export async function getActivePlatformKeyMeta(
  provider: KeyProvider = 'anthropic',
  db: Database = defaultDb,
): Promise<PlatformKeyMeta | null> {
  const [row] = await db
    .select()
    .from(platformApiKeys)
    .where(and(eq(platformApiKeys.active, true), eq(platformApiKeys.provider, provider)))
    .limit(1);
  if (!row) return null;
  const raw = await decrypt(row.keyEncrypted);
  return { maskedKey: maskKey(raw), createdAt: row.createdAt, lastRotatedAt: row.lastRotatedAt };
}
