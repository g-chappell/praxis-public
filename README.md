# Praxis

A collaborative build platform where pairs of people create, deploy, and learn together with AI agents — without needing to be developers.

## Vision

Praxis turns "we have an idea, but neither of us can really code" into a working prototype within an afternoon. It hosts Claude Code today (with OpenAI Codex planned via the ACP host abstraction) in a managed multiplayer environment, with template-driven project starters, in-sandbox preview deployment, and a contextual educational layer.

The platform is designed for pairs. Two people building something together with AI agents is a revealing way to test collaboration, contributions, and idea viability. Every user builds a portfolio of projects, skills, and completed learning that serves as visible evidence of capability.

## Target Audience

- **Potential co-founders** testing collaboration pre-commitment
- **Teammates** exploring internal ideas or proof-of-concepts
- **Mentor-mentee pairs** learning to build with AI agents
- **Hackathon and study partners**
- **Friends with an idea** who want to see what it could look like

## Product Pillars

| Pillar | Description |
|--------|-------------|
| **Template-driven initiation** | Pick what to build (web game, SaaS, dashboard) and get a pre-configured sandbox with libraries and conventions |
| **Real-time collaborative workspace** | Shared environment with file tree, code preview, and prompt history visible to both partners |
| **Dual-harness agent support** | Claude Code and OpenAI Codex in per-project sandboxes via user OAuth subscriptions |
| **In-sandbox preview deployment** | Live URL during sessions for real-time previews |
| **Embedded learning** | Educational content woven into the workspace with progress tracking |
| **Profile and portfolio** | User profiles showing projects, skills, and learning history |

## Tech stack

POC status as of EPIC-01 close (all stack choices reversible behind the ACP host + Sandbox abstractions; see ADRs in `docs/decisions/`).

- **Frontend:** Next.js 14 (App Router), shadcn/ui, Tailwind. (Workspace UI with Monaco editor is post-POC.)
- **Hosting:** Single VPS, Caddy + Docker, auto-deploy on merge. (ADR-0001 / ADR-0004.)
- **Backend:** Bun + Hono in `services/orchestrator`.
- **Database:** Postgres 16 with Drizzle ORM. (ADR-0005.)
- **Auth:** Better Auth, magic-link sign-in via Resend.
- **Sandboxing:** Docker via the `Sandbox` interface in `packages/sandbox`. (E2B / Firecracker swap-in is post-POC.)
- **Agent harnesses:** Claude Code today, behind the `AcpHost` layer in `packages/acp-host`. Codex via the same interface is the next harness.

For the actual deployed shape see [ARCHITECTURE.md](ARCHITECTURE.md); for development conventions see [AGENTS.md](AGENTS.md).

## Business Model

Bring Your Own Subscription — users link their own Anthropic and OpenAI accounts via OAuth. The platform charges a flat monthly fee for the collaborative layer (workspace, sandbox, templates, education, deployment).

| Tier | Price | Features |
|------|-------|----------|
| Trial | Free (14 days) | Platform-managed agent access, one active project |
| Standard | £15/user/month | BYO subscription, multiple projects, full libraries |
| Plus | £35/user/month | Persistent preview URLs, priority sandbox startup |
| Enterprise | Custom | Real hosted deployment, SSO/SAML, team admin |

## Documentation

- [docs/executive_summary.md](docs/executive_summary.md) — product context: who Praxis is for, the six pillars, POC vs post-POC phase
- [docs/project_plan.md](docs/project_plan.md) — full engineering spec, data model, week-by-week POC roadmap
- [ARCHITECTURE.md](ARCHITECTURE.md) — current system shape, what's deployed today
- [AGENTS.md](AGENTS.md) — agent-context rules, conventions, key commands (also `docs/conventions/` + `docs/runbooks/`)
- [docs/decisions/](docs/decisions/) — ADRs covering deploy topology, lint/format choice, auth schema, and other crossing-component decisions
