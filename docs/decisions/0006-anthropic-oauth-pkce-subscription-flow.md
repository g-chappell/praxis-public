# 0006 — Anthropic OAuth via PKCE subscription flow (public client)

**Date:** 2026-06-01
**Status:** Accepted — but **not used for inference** (see amendment below).

> **Amendment (STORY-24, 2026-06-12): reserved, not used for inference.** Under
> ADR-0009 the **platform** API key powers all inference (hosted multiplayer
> can't run on a personal subscription). The per-user OAuth flow below is **no
> longer wired into agent spawn** — the orchestrator passes only the platform
> `ANTHROPIC_API_KEY`, never a per-user `CLAUDE_CODE_OAUTH_TOKEN` (guarded by a
> test in `packages/acp-host`). The Settings UI that surfaced "Connect to Claude
> Code" was **removed** so nothing implies OAuth powers sessions. The flow itself
> is **retained but unsurfaced** — routes (`/api/oauth/anthropic/{authorize,
> exchange,disconnect}`), `lib/anthropic-oauth.ts`/`lib/anthropic-token.ts`, and
> the `oauth_tokens` table stay intact, reserved for a future identity /
> bring-your-own-key tier. The "Decision" bullet about passing the token to the
> agent describes the original STORY-06 design, which no longer holds.

## Context

STORY-06 connects a user's Anthropic account so the orchestrator can run
Claude Code on *their* plan ("the prompting user's credentials are used" —
`docs/project_plan.md` §6). §10 of that plan describes a "standard OAuth flow"
with "the platform's client ID and required scopes" and refresh tokens — which
reads like a **confidential-client** authorization-code flow (a registered
client with a secret).

In practice Anthropic does not offer a generic third-party OAuth provider where
a platform registers a confidential client to obtain tokens against a user's
**Claude subscription**. The mechanism that actually grants a credential usable
by Claude Code on a user's Pro/Max plan is the "Sign in with Claude" flow: a
**PKCE public client** (no secret), authorizing at `claude.ai/oauth/authorize`
and exchanging at `console.anthropic.com/v1/oauth/token`. This ADR records the
divergence from the §10 wording and the chosen flow, because OAuth/token
handling is load-bearing security (see AGENTS.md "Never do").

## Decision

Implement the **PKCE public-client, code-paste** flow — the same one the Claude
Code CLI uses.

- No client secret. CSRF protection is a `state` cookie *plus* the PKCE
  `code_verifier` (httpOnly, 15-min TTL), verified at exchange time.
- **The public Claude Code client only allow-lists Anthropic's own
  `https://console.anthropic.com/oauth/code/callback` redirect** — it rejects an
  arbitrary Praxis web callback (verified live: *"Redirect URI … is not supported
  by client"*). So we cannot auto-redirect back to Praxis. Instead: authorize →
  Anthropic renders the code → the user pastes it into `/settings` →
  `POST /api/oauth/anthropic/exchange` completes it.
- Client ID and redirect URI stay env-configurable (`ANTHROPIC_OAUTH_CLIENT_ID`,
  `ANTHROPIC_OAUTH_REDIRECT_URI`). If a Praxis-specific client that allow-lists a
  real web callback is ever provisioned, setting those two vars restores a
  seamless redirect with no code change.
- Tokens are encrypted at rest with `@praxis/crypto` (`oauth_tokens`,
  `PRAXIS_MASTER_KEY`) and never logged.
- `getValidAnthropicToken(userId)` refreshes when the access token is within 60s
  of expiry; the orchestrator calls it at agent-spawn time and passes the token
  to Claude Code via `CLAUDE_CODE_OAUTH_TOKEN`.

Flow, endpoints, env, and operator follow-ups are documented in
`docs/runbooks/anthropic-oauth.md`.

## Consequences

- Matches reality and §6's "user's own subscription" intent; no secret to store
  or rotate for the OAuth client itself.
- One extra manual step (copy/paste the code) vs a seamless redirect — the cost
  of using the public client. Removable later via a registered client (env only).
- The consent + paste round-trip can't run in CI; it's a live-verify step.
- OpenAI/Codex OAuth (next phase) is a *different* flow — do not assume this one
  generalizes; it will get its own ADR.
- Swapping to a confidential-client flow later (if Anthropic ships one) is an
  ADR + a `lib/anthropic-oauth.ts` change, not a schema change — `oauth_tokens`
  already stores access/refresh/expiry generically.

## Alternatives considered

- **Confidential-client authorization-code flow (literal §10).** Needs an
  Anthropic-issued client secret for subscription access, which isn't offered;
  rejected as not buildable today.
- **API-key paste (user pastes an Anthropic API key).** Simpler, but bills the
  platform's/!user's API account rather than running on their Claude subscription,
  and pushes raw long-lived secrets through the UI. Rejected — wrong billing
  model and worse security posture than short-lived OAuth tokens.
