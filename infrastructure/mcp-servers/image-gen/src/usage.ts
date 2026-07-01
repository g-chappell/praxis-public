// Usage-cap check (STORY-15/TASK-043). Before generating, the server asks the
// orchestrator (which owns the DB) whether this project is under its per-day cap,
// presenting the capability token the orchestrator handed it. The server never
// touches Postgres itself — no DB creds live in the sandbox.

export interface UsageConfig {
  /** Orchestrator endpoint, e.g. http://orchestrator:4001/internal/mcp/usage. */
  url?: string;
  /** Per-room capability token (resolves to exactly one project). */
  token?: string;
  tool: string;
  fetchImpl?: typeof fetch;
}

export interface UsageVerdict {
  allowed: boolean;
  reason?: string;
}

/** Returns whether the call may proceed. If capping isn't configured (no url or
 *  token — e.g. a standalone/local run) the call is uncapped → allowed. When it IS
 *  configured, any failure (non-2xx, network, parse) is fail-CLOSED → denied, so a
 *  blip never lets unbounded spend through the paid image API. */
export async function checkUsageAllowed(cfg: UsageConfig): Promise<UsageVerdict> {
  if (!cfg.url || !cfg.token) return { allowed: true };
  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchImpl(cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: cfg.token, tool: cfg.tool }),
    });
    if (!res.ok) return { allowed: false, reason: `usage endpoint returned ${res.status}` };
    const data = (await res.json()) as { allowed?: boolean; count?: number; cap?: number };
    if (data.allowed) return { allowed: true };
    return {
      allowed: false,
      reason: `daily cap reached (${data.count ?? '?'}/${data.cap ?? '?'})`,
    };
  } catch (err) {
    return { allowed: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
