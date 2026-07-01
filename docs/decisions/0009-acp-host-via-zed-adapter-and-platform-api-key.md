# 0009 — ACP host via the Zed Claude adapter, on a platform-owned API key

**Date:** 2026-06-01
**Status:** Accepted

## Context

STORY-08 builds `packages/acp-host`: given a sandbox and a credential, spawn the
agent inside the sandbox, drive a prompt turn, and stream typed events back. Two
project commitments collided during planning, and resolving them sets the shape of
this whole layer — hence an ADR (ACP is load-bearing per AGENTS.md; the billing
model is a product decision).

`docs/project_plan.md` §4 assumes the agent speaks ACP natively (`claude-code --acp`)
on the **prompting user's Claude subscription** (§6, ADR-0006). Neither half holds:

- **Claude Code has no native ACP mode.** Its headless protocol is bidirectional
  `stream-json`, not ACP. The only maintained ACP path for Claude is the
  `claude-agent-acp` adapter (originally `@zed-industries/`, now
  `@agentclientprotocol/claude-agent-acp`), which wraps the **Claude Agent SDK**.
- **A hosted multiplayer platform cannot run on a Pro/Max subscription.** This is
  explicit in Anthropic's published terms (clauses verified against the live documents
  2026-06-02 — see References):
  - **Consumer Terms** (eff. 2025-10-08), which govern Free/Pro/Max: **§2** — "You may
    not share your Account login information, Anthropic API key, or Account credentials
    with anyone else or **make your Account available to anyone else**"; **§11** — "You
    agree **not to use our Services for any commercial or business purposes**"; **§3**
    bars using the Services to "resell the Services." Hosting one person's subscription
    for other users breaches all three — independent of token caps, so the "it's just
    capped vs uncapped" framing is not the operative distinction.
  - **Claude Code → Legal and compliance → Authentication and credential use:** OAuth
    "is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and
    Enterprise subscription plans and is designed to support ordinary use"; and
    "**Anthropic does not permit third-party developers to offer Claude.ai login or to
    route requests through Free, Pro, or Max plan credentials on behalf of their
    users.**" Developers "should use API key authentication." That is exactly the Praxis
    case (and applies equally whether we drive the Agent SDK or Claude Code).

  The Zed adapter operationalizes the same boundary — it rejects subscription OAuth and
  requires `ANTHROPIC_API_KEY` (adapter issue #421).

The product requirement behind "subscription" was never the *plan type* — it was
(a) one project **owner inherits the cost** and (b) the pair shares **one aligned
session**. API keys under the **Commercial Terms** (eff. 2025-06-17) satisfy both and
are the sanctioned path for hosted multi-user use: **§A.1** — "Anthropic gives Customer
permission to use the Services, including to **power products and services Customer makes
available to its own customers and end users ("Users")**." So the difference between the
two routes is the *governing contract and its license grant*, not a resource cap.

## Decision

**Speak ACP to the Zed adapter, authenticated by a platform-owned Anthropic API key.**

- **Host (our side):** `packages/acp-host` is an ACP **client** built on the official
  ACP TypeScript SDK `@agentclientprotocol/sdk` (`ClientSideConnection`, pinned
  `^0.23.0`; the package formerly published as `@zed-industries/agent-client-protocol`,
  now deprecated). This keeps us on the open standard, so Codex and other ACP-speaking
  agents plug in later (project_plan §4 intent), and is the "evaluate existing OSS ACP
  libraries first" path AGENTS.md/§4 call for.
- **Agent (in the sandbox):** `@agentclientprotocol/claude-agent-acp` (pinned `0.39.0`),
  launched via `Sandbox.spawn`, speaking ACP/JSON-RPC over stdio.
- **Auth & billing:** the platform holds an Anthropic API key (Commercial Terms),
  injected as `ANTHROPIC_API_KEY` into the sandbox at spawn; **no
  `CLAUDE_CODE_OAUTH_TOKEN` is present** in that env. Praxis meters per-project usage
  (surfaced on the `turn-complete` event) and bills the owner. A single credential per
  `spawnAndPrompt` call **is** the owner-pays model; the orchestrator (STORY-09)
  chooses which project's key, and multi-user attribution is STORY-12.

This supersedes the `claude-code --acp` and per-user-subscription assumptions in
`docs/project_plan.md` §4/§6, and pairs with ADR-0006 (which recorded the same kind
of plan-vs-reality divergence for the OAuth flow itself).

## Consequences

- The "sacred" ACP abstraction stays **literal** on the wire — no custom protocol —
  and the `AcpHost` interface remains the swap point for future agents/transports.
- **Claude Code harness fidelity is high but not total.** Skills, slash commands,
  subagents, `CLAUDE.md`/`AGENTS.md`, and MCP servers all flow through the adapter
  (we provision them by owning the sandbox filesystem). **Hooks are not exposed** by
  the adapter today — accepted for the POC: end-user projects won't author hooks, and
  platform automation (auto-commit STORY-17, learning links) lives in the orchestrator
  off ACP events instead.
- **New follow-up work:** (1) a metering/billing story that consumes per-turn usage;
  (2) a roadmap conversation on STORY-06 OAuth's future — it is no longer used for
  inference under this model and may become vestigial or be repurposed (identity, or a
  future bring-your-own-key tier). STORY-06 code is **not** unwound here.
- **Compliance obligations we inherit on the API route** (Commercial Terms — build, don't
  assume): **§A.1/§D.4** — we are permitted to *power a product* for end users but must
  not "resell the Services," so Praxis stays a value-added product and never exposes raw
  API access or resells keys/credits; **§D.2** — Customer *and its Users* may only use the
  Services in compliance with the Usage Policy; **§D.3** — must notify Users that factual
  assertions in Outputs need independent verification; **§D.5** — Customer is responsible
  for all activity under its account; **§K.2** — Customer must defend Anthropic against
  claims from its Users' violations. Roadmap coverage: per-project metering (STORY-22) +
  budget caps that pause (STORY-23) bound spend/abuse; admin role + encrypted platform-key
  lifecycle (STORY-20/21) keep the key controlled. **Gap:** a user-facing acceptable-use
  pass-through (§D.2) + an output-reliability disclaimer (§D.3) are not yet a roadmap
  story — add one before any public launch. This reading is not legal advice; counsel
  should review the resale boundary (§D.4) pre-launch.
- **Operator burden:** provision a platform API key (and a budget-limited CI test key);
  rebuild/redeploy the sandbox base image with the adapter baked in.
- **Cost shifts** from flat subscription to metered per-token spend, fronted by the
  platform until metering lands — so usage is surfaced from day one and CI stays off
  the live key by default.
- Reversibility: adopting native Claude-Code ACP (if Anthropic ships it) or a
  bring-your-own-subscription tier is a new ADR + an `AcpHost` transport swap, not a
  consumer rewrite.

## Alternatives considered

- **Subscription OAuth + Claude Code CLI `stream-json` (our own ACP-shaped adapter).**
  Preserves the full harness incl. hooks and avoids API billing, but breaks the ToS for
  hosted multiplayer and abandons the ACP wire — rejected on compliance.
- **Zed adapter on per-user subscription OAuth.** Not possible — the adapter requires
  an API key and rejects subscription tokens.
- **Third-party CLI-bridge ACP adapters (`acp-claude-code`, ACPX).** Would allow
  subscription OAuth, but still ToS-barred for hosting, less official, and wrap the same
  `stream-json` underneath — more fragility for no gain once API billing is chosen.
- **Each user brings their own subscription, Praxis replays shared context.** Avoids
  account-sharing but cannot share one live session, costs more per turn, and is the
  most complex — fails the "one aligned session" requirement.
- **Hand-rolled ~300-line ACP client** (the roadmap's fallback). Unnecessary now that a
  maintained official client lib exists; we'd own protocol drift for no benefit.

## References

Primary sources, read 2026-06-02 (re-check before launch — terms change):

- **Anthropic Consumer Terms of Service** (eff. 2025-10-08) — §2 (no sharing / making
  account available), §3 (no resale), §11 (no commercial/business use). Governs
  Free/Pro/Max. <https://www.anthropic.com/legal/consumer-terms>
- **Anthropic Commercial Terms of Service** (eff. 2025-06-17) — §A.1 (permission to power
  products for end users), §D.2–D.5 (Usage Policy compliance, output notice, use
  restrictions/no-resale, account responsibility), §K.2 (defense for Users' violations).
  Governs the API. <https://www.anthropic.com/legal/commercial-terms>
- **Claude Code — Legal and compliance** ("Authentication and credential use": OAuth is
  for ordinary subscription use; third-party developers may not offer Claude.ai login or
  route requests through Free/Pro/Max credentials on behalf of users; developers should
  use API keys). <https://code.claude.com/docs/en/legal-and-compliance>
- **Can I use the Claude API for individual use?** (API is governed by the Commercial
  Terms regardless of individual vs company).
  <https://support.claude.com/en/articles/8987200-can-i-use-the-anthropic-api-for-individual-use>
- **Anthropic Usage Policy.** <https://www.anthropic.com/legal/aup>
