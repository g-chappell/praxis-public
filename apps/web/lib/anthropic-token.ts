// Token retrieval with refresh-on-expiry. The orchestrator calls this at
// agent-spawn time (and the web app for status) to obtain a usable Anthropic
// access token for a user, transparently refreshing when it is within 60s of
// expiry. Tokens live encrypted in oauth_tokens; this module is the only place
// that decrypts them for use.

import { and, eq } from 'drizzle-orm';

import { decrypt, encrypt } from '@praxis/crypto';
import { oauthTokens } from '@praxis/db';
import { type Database, db as defaultDb } from '@praxis/db/client';

import { PROVIDER, refreshTokens } from './anthropic-oauth';

const EXPIRY_SKEW_MS = 60_000;

export class NotConnectedError extends Error {
  constructor() {
    super('Anthropic account is not connected');
    this.name = 'NotConnectedError';
  }
}

/** True when the token is missing an expiry buffer (expired or within skew). */
export function isExpiringSoon(
  expiresAt: Date | null,
  now: number,
  skewMs: number = EXPIRY_SKEW_MS,
): boolean {
  // No expiry recorded → treat as long-lived; never force a refresh we can't verify.
  if (!expiresAt) return false;
  return expiresAt.getTime() - now < skewMs;
}

interface GetTokenOptions {
  /** Injectable for tests; defaults to the lazy @praxis/db/client singleton. */
  db?: Database;
  /** Injectable clock for tests. */
  now?: number;
}

/**
 * Return a valid Anthropic access token for `userId`, refreshing first if it is
 * within 60s of expiry. Throws {@link NotConnectedError} if the user has not
 * connected Anthropic.
 */
export async function getValidAnthropicToken(
  userId: string,
  options: GetTokenOptions = {},
): Promise<string> {
  const db = options.db ?? defaultDb;
  const now = options.now ?? Date.now();

  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, PROVIDER)))
    .limit(1);

  if (!row) {
    throw new NotConnectedError();
  }

  if (!isExpiringSoon(row.expiresAt, now)) {
    return decrypt(row.accessTokenEncrypted);
  }

  if (!row.refreshTokenEncrypted) {
    throw new Error(
      'Anthropic token expired and no refresh token is available; reconnect required',
    );
  }

  const refreshToken = await decrypt(row.refreshTokenEncrypted);
  const tokens = await refreshTokens(refreshToken);

  const accessTokenEncrypted = await encrypt(tokens.accessToken);
  const refreshTokenEncrypted = tokens.refreshToken
    ? await encrypt(tokens.refreshToken)
    : row.refreshTokenEncrypted;

  await db
    .update(oauthTokens)
    .set({ accessTokenEncrypted, refreshTokenEncrypted, expiresAt: tokens.expiresAt })
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, PROVIDER)));

  return tokens.accessToken;
}
