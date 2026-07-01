# Runbook: Anthropic (Claude) OAuth

How a Praxis user connects their own Claude subscription so the orchestrator
can drive Claude Code on their plan. Implements the **PKCE public-client,
code-paste** flow — the same one the Claude Code CLI uses (see ADR-0006). No
client secret.

> **Why code-paste and not a seamless redirect?** The public Claude Code OAuth
> client only allow-lists Anthropic's own `console.anthropic.com/oauth/code/callback`
> redirect; it rejects an arbitrary Praxis web callback (*"Redirect URI … is not
> supported by client"*). So the user copies the code Anthropic shows them and
> pastes it back into Praxis.

## Flow

```
/settings → "Connect to Claude Code"  (client component opens a new tab)
  → GET /api/oauth/anthropic/authorize
      mints CSRF state + PKCE verifier/challenge
      sets httpOnly cookies (anthropic_oauth_state, anthropic_oauth_verifier; 15-min TTL)
      302 → https://claude.ai/oauth/authorize?...&redirect_uri=console.../oauth/code/callback&...
  → user consents on claude.ai
  → Anthropic renders an authorization code (shown as `code#state`)
  → user copies it, returns to the Praxis /settings tab, pastes it
  → POST /api/oauth/anthropic/exchange  { code }
      reads verifier + state cookies; verifies any pasted state (timing-safe)
      POST https://console.anthropic.com/v1/oauth/token  (code + state + code_verifier)
      encrypts access/refresh via @praxis/crypto
      upserts oauth_tokens (unique on user_id, provider='anthropic')
      → { ok: true }; the page refreshes to "Connected to Claude Code ✓"
```

At agent-spawn time the orchestrator calls `getValidAnthropicToken(userId)`,
which refreshes when the access token is within 60s of expiry and passes the
token to Claude Code via `CLAUDE_CODE_OAUTH_TOKEN`.

## Configuration

Read by `apps/web/lib/anthropic-oauth.ts`:

| Env var | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_OAUTH_CLIENT_ID` | Claude Code public client ID | Override only if a Praxis-specific client is provisioned. |
| `ANTHROPIC_OAUTH_REDIRECT_URI` | `https://console.anthropic.com/oauth/code/callback` | Setting a real web callback (allow-listed by a registered client) restores a seamless redirect — but the route handlers currently implement the paste flow; a registered client would also need the callback route re-added. |
| `PRAXIS_MASTER_KEY` | — | 32-byte base64 key for token encryption. See `key-rotation.md`. |

No client secret is required (PKCE).

## Operator follow-ups

- [ ] **Add `PRAXIS_MASTER_KEY`** to `/etc/praxis/praxis.env` (ASCII-only, no
      inline comment — see `key-rotation.md`). Required before connect works.

## Verify live (tier-1 deploy rule — CI can't run consent)

1. Sign in, open `https://praxis.blacksail.dev/settings`.
2. Click **Connect to Claude Code** → a new tab opens to claude.ai → consent.
3. Copy the code Anthropic shows; return to the `/settings` tab; paste it; click
   **Finish connecting**. The page should flip to **Connected to Claude Code ✓**.
4. Confirm the row exists:

   ```bash
   # On the VPS:
   docker exec praxis-db psql -U praxis -d praxis -c \
     "select user_id, provider, expires_at, connected_at from oauth_tokens where provider='anthropic';"
   ```

   A row with non-null `access_token_encrypted` proves persistence; decryption is
   exercised by the refresh path on the next agent spawn.

## Failure modes (returned by /api/oauth/anthropic/exchange, shown inline on /settings)

| `error` | Cause |
| --- | --- |
| `connection_expired` | The state/verifier cookies expired (15-min TTL) or the attempt was never started. Start again. |
| `missing_code` | Empty paste. |
| `state_mismatch` | The pasted code's embedded state didn't match the cookie — stale tab or wrong attempt. |
| `exchange_failed` | Anthropic rejected the code (mistyped/partial paste, wrong client, expired code). |
| `unauthorized` | The Praxis session expired. |

## Related

- ADR-0006 — PKCE subscription OAuth (code-paste) decision.
- `docs/runbooks/key-rotation.md` — the key protecting these tokens.
- `apps/web/lib/anthropic-oauth.ts`, `app/api/oauth/anthropic/{authorize,exchange,disconnect}`,
  `components/connect-claude-code.tsx`.
