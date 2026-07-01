# Executive Summary

**Document type:** Product brief
**Status:** Active; POC phase scoped and ready to build
**Working name:** TBD

---

## Product

A collaborative workspace where two people build, deploy, and learn together with AI coding agents.

The platform hosts Claude Code and OpenAI Codex inside a managed multiplayer environment — the same agents a technical user might run on their own machine, but designed so two non-technical people can pair on a real project from a templated starting point and produce a working application by the end of the session. Templates handle the technical setup; the agents do the heavy lifting; the platform handles real-time collaboration, sandboxing, git, deployment to a preview URL, and embedded learning content tailored to the harnesses being used. Each user authenticates with their own Anthropic and OpenAI accounts via OAuth, so the agents run on the user's own subscriptions.

The output of a session is threefold: a working application visible at a live URL, a git history that shows how the pair built it, and a growing portfolio for each user that captures their work, their authored skills, and the learning they have completed. The portfolio is the assessment surface — when one user wants to know what their partner brings to a collaboration, they look at what their partner has built, not at any score the platform invented.

## Target audience

Pairs of non-technical or lightly-technical people who want to build something together. The most natural users are potential co-founders pre-commitment, but the same shape fits teammates exploring an internal idea, mentor-mentee pairs, hackathon partners, and friends with a shared idea worth testing.

Advanced tiers serve technical users who want a multiplayer Claude Code or Codex environment with deployment included — the same platform, with abstractions thinned and more direct control surfaced. Solo users, larger teams, and production engineering at scale are out of scope.

## Product pillars

Six surfaces define the platform.

**Template-driven project initiation.** Users pick what they want to build — a web game, a SaaS landing site, an internal tool, a data dashboard — and the platform provisions a pre-configured sandbox with the chosen libraries, structure, and conventions. The template is transparent about what it uses (React, Phaser, Postgres, etc.) without requiring the user to wire anything up. Each template specifies the harness it runs on and any MCP servers it enables — for example, an image-generation MCP server for visually-heavy templates.

**Real-time collaborative workspace.** A shared three-panel environment where partners chat with each other and prompt the agent in the same surface. File tree, code preview, prompt history, and git state are visible to both. Per-user cursors, follow mode (one user follows the other's or the agent's navigation), and per-user undo history are first-class concepts — the collaboration model is closer to Zed than to a screenshare.

**Agent integration via ACP.** The platform integrates with Claude Code and Codex through the Agent Client Protocol, the open standard for editor-to-agent communication that Zed has driven adoption of. The platform acts as an ACP host; Claude Code and Codex are ACP-speaking agents invoked with the prompting user's OAuth credentials. Adopting the open standard rather than building a custom abstraction means the integration work is bounded, the platform is interoperable with future ACP-supporting agents, and engineering focus stays on what genuinely differentiates the product.

**Git as a first-class feature.** Every project has a local git repository. The agent commits at meaningful stages — task completion, before destructive operations, on user request — and writes its own commit messages. The workspace surfaces git operations (commit, branch, diff, revert) using the standard terminology, accompanied by in-product explanations and links to learning content. The platform teaches users to use git as part of using the platform; it does not abstract git away.

**Embedded learning.** Educational content is woven into the workspace and tailored to the harness being used. The platform starts with curated third-party material — Anthropic Cookbook, OpenAI Codex documentation, established git tutorials, agentic prompting guides — and progressively adds in-house authoring that reframes and contextualises that content for pair-building and non-technical users. Lessons completed, skills authored, and concepts engaged with are tracked at the user level and surface on the portfolio.

**Profile and portfolio.** Every user has a profile showing their projects, the templates they have used, the skills they have authored, the learning they have completed, and selected projects they have chosen to display. Profiles are open by default within a team — partners see each other's profiles automatically as the natural assessment mechanism — and private by default globally; users selectively publish individual items. Project ownership is with the user under standard terms; the platform retains a minimal licence for hosting and product improvement.

## POC phase

The build is staged. The POC delivers a working end-to-end slice of the platform within one month, focused on the smallest configuration that demonstrates the core product experience.

POC scope:

- One template (a React/Phaser web game, chosen for visual reward and natural exercise of image-generation MCP)
- Claude Code as the sole supported agent in this phase, integrated via ACP
- Docker-based sandboxing on a single VPS (the abstraction is in place so production-grade alternatives can swap in later)
- Magic-link auth and Anthropic OAuth linking
- Three-panel workspace with file-level locking and basic presence
- Git surface with auto-commit at meaningful stages and a revert action
- Image-generation MCP server using OpenAI's image API
- Curated learning links (no in-house authored content yet)
- Two-or-three test pairs of university students completing a real session

Deferred to the immediate next phase: Codex via ACP and a second template, Yjs-based co-editing, follow mode, per-user undo, the skills system, the full profile and portfolio surface, and in-house learning content authoring. Productisation considerations — pricing tiers, billing infrastructure, enterprise features, real persistent deployment to hosting platforms — are sketched at the end of this document and held until the platform's foundation is in place.

The POC completes when one template can be completed end-to-end by a pair, the harness behaves reliably, the resulting app is visible at a preview URL, and the curated learning surface is in place. At that point the product moves into the next phase, which expands along the pillars above.

## Capabilities required

Across all phases, grouped by category.

| Category | Capabilities |
|---|---|
| Identity | Email-based auth, OAuth linking to Anthropic and OpenAI accounts, account management |
| Teams & projects | Pair-only team creation, invitation flows, project creation from templates |
| Workspace | Three-panel UI, file tree, Monaco editor, chat and prompt panel, real-time sync, presence |
| Agent integration | ACP host implementation, per-template harness selection, prompt queueing across two users, attribution |
| Sandboxing | Per-project isolated environments, egress controls, resource limits, idle shutdown, audit logging |
| Templates | Template catalogue and versioning, harness specification, MCP server declaration, scaffold provisioning |
| Git | Per-project local repository, agent-driven commits, UI surface for commit, diff, revert |
| Preview deployment | Sandbox-internal URLs during active sessions, restart on session resume |
| MCP servers | Image generation in the POC; deployment, testing, and other specialised servers in later phases |
| Learning | Curated and authored content, harness-specific lessons, progress tracking, skill milestones |
| Profile & portfolio | Public/team visibility model, project showcase, learning history, selective publishing |
| Observability | Structured logging, per-session metrics, session replay for debugging |
| Security | Encrypted OAuth tokens, audit trails, basic GDPR posture |

## Tech stack

The stack uses open standards and open-source or free-tier infrastructure throughout, with documented swap-in paths for components most likely to need replacement at scale.

| Layer | Choice |
|---|---|
| Frontend framework | Next.js (App Router) |
| Frontend hosting | Cloudflare Pages |
| UI library | shadcn/ui + Tailwind |
| Code editor | Monaco (Yjs bindings layered in later) |
| Auth | Better Auth (or Lucia) on the project's Postgres |
| Database | Postgres |
| Real-time transport | Own WebSocket on the Orchestrator |
| Orchestrator | Bun + Hono |
| Agent integration | Claude Code and Codex CLI via ACP |
| Sandbox | Docker on a VPS in the POC; abstracted behind a `Sandbox` interface for later swap to E2B, Firecracker, or Daytona |
| MCP servers | Image generation via OpenAI Image API |
| Object storage | S3-compatible (MinIO self-hosted, or Cloudflare R2) |
| Observability | OpenTelemetry, with self-hosted or free-tier collectors |
| Repository | GitHub (public) |

Two pieces of platform engineering carry disproportionate weight: the **ACP integration layer** that lets the platform speak to any ACP-compatible agent, and the **Sandbox interface** that makes the underlying execution environment swappable. Both should be designed with abstraction discipline from the start.

## Future considerations

A path to productisation if the POC delivers and subsequent phases prove user adoption.

**Productisation phases.** The skills system, full profile and portfolio surface, expanded template catalogue, Codex parity, Yjs co-editing, and in-house learning content authoring all sit in the immediate post-POC phase. Real persistent deployment to hosting platforms (Cloudflare Pages, Vercel) and team-level admin sit further out.

**Tier structure.** A future product version would likely offer a free trial (platform-managed agent budget for a limited window), a standard tier (~£15 per user per month, BYO Anthropic and OpenAI subscriptions, sandbox-bound preview), a plus tier (persistent preview URLs, priority sandbox startup), and an enterprise tier (real hosted deployment, SSO, organisational controls). The platform charges for the collaborative layer, the templates, the education, and the deployment; users supply their own agent subscriptions via OAuth.

**Infrastructure scaling.** Swap Docker-on-VPS sandboxing for E2B, Firecracker, or scaled Daytona. Move Postgres to a managed provider with backups and HA. Multi-region orchestrator deployment. Full observability with cost dashboards.

**Compliance and security.** Full GDPR posture (deletion cascades, data export, lawful basis, sub-processor disclosure). Data residency options. Penetration testing before any paying enterprise customer.

None of this is in the current build. It is sketched so the path is visible and the foundations laid in the early phases do not preclude it.

## Open decisions

- **Product name.** Deferred until the platform takes a shareable shape.
- **Specific POC template.** React/Phaser web game is the leading candidate; confirm before build begins.
- **VPS provider.** Hetzner is the leading candidate; alternatives include Oracle Cloud free tier and small Fly.io machines.

## Summary

The platform lets two non-technical people build, deploy, and learn together with AI coding agents. Six product pillars define the surface. The POC delivers the smallest end-to-end slice — one template, Claude Code via ACP, Docker sandboxing, magic-link auth, basic git, image-generation MCP, curated learning — within one month. Subsequent phases expand along the pillars, with productisation considerations held in reserve.

Engineering effort concentrates on the two pieces of the platform that matter most: the ACP integration that makes the product interoperable with the current and future generation of coding agents, and the Sandbox abstraction that keeps infrastructure choices reversible. Everything else uses open standards or open-source defaults.
