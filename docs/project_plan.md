# Project Plan

**Document type:** Engineering specification
**Status:** POC phase scoped; build to commence
**Time budget for POC:** 1 month

---

## 1. Overview

This plan covers the engineering work for the platform described in the Executive Summary. It scopes the POC phase in detail and sketches the immediate post-POC phase. Productisation work (billing, enterprise, real persistent deployment) is out of scope here; it lives in the Executive Summary's Future Considerations.

The build is grounded in two open standards — the Agent Client Protocol (ACP) for editor-to-agent communication, and the Model Context Protocol (MCP) for specialised agent capabilities — and in the documentation conventions of the agentic coding ecosystem (AGENTS.md, CLAUDE.md, `.claude/skills/`). Adopting these conventions in the codebase is itself a design principle: the platform should be a well-formed example of the patterns it teaches.

---

## 2. Architecture

### High-level shape

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (User A)                    Browser (User B)            │
│  ┌──────────────────┐                ┌──────────────────┐        │
│  │ Next.js frontend │                │ Next.js frontend │        │
│  │ (Cloudflare      │                │                  │        │
│  │  Pages)          │                │                  │        │
│  └────────┬─────────┘                └────────┬─────────┘        │
└───────────┼────────────────────────────────────┼─────────────────┘
            │ WebSocket + HTTP                   │
            └──────────────┬─────────────────────┘
                           ▼
          ┌──────────────────────────────────────────┐
          │  Orchestrator (Bun + Hono on VPS)        │
          │  - WebSocket hub (rooms per project)     │
          │  - Prompt queue + attribution            │
          │  - ACP host implementation               │
          │  - Sandbox lifecycle                     │
          │  - Event log writer                      │
          └─────────┬──────────────────┬─────────────┘
                    │                  │
                    ▼                  ▼
       ┌─────────────────────┐  ┌──────────────────────┐
       │ Docker container    │  │ Postgres             │
       │ per project (VPS)   │  │                      │
       │                     │  │ - users              │
       │ + Claude Code CLI   │  │ - teams              │
       │   speaking ACP      │  │ - projects           │
       │ + project files     │  │ - sessions           │
       │ + .git/             │  │ - events             │
       │ + MCP server(s)     │  │ - oauth_tokens       │
       │ + preview port      │  │ - learning_links     │
       └─────────────────────┘  └──────────────────────┘
```

### Core principles

- **Orchestrator owns active sessions.** WebSocket hub, prompt queue, ACP communication, sandbox lifecycle. Postgres is the persistence layer, not the coordination layer.
- **Agents speak ACP.** Claude Code and (in the next phase) Codex CLI both implement ACP natively. The Orchestrator is an ACP host. Standard JSON-RPC over stdio.
- **Sandboxes are Docker containers on a VPS for the POC.** The `Sandbox` interface in code is abstract; E2B, Firecracker, or Daytona implementations slot in later without touching consumers.
- **Real-time uses one transport.** Single WebSocket per user to the Orchestrator. The Orchestrator broadcasts to all members of a project room.
- **OAuth credentials per user.** Each user OAuth-links their Anthropic account (Codex via OpenAI in the next phase). When the agent is invoked, the prompting user's credentials are used.

---

## 3. Project Structure and Documentation Conventions

Documentation is part of the codebase, not separate from it. The repository follows the agentic-coding conventions emerging in the ecosystem so that both human contributors and AI coding agents (Claude Code, Codex, Cursor, Zed, etc.) can work effectively on the code from the first session.

### Repository layout

```
collab-build-platform/
├── AGENTS.md                    # primary cross-tool context file
├── CLAUDE.md                    # short; @imports AGENTS.md
├── README.md                    # human-readable project overview
├── ARCHITECTURE.md              # high-level architecture (current state)
├── .claude/
│   ├── skills/                  # project-specific Claude Code skills
│   │   ├── add-template/SKILL.md
│   │   ├── work-with-acp/SKILL.md
│   │   └── work-with-mcp/SKILL.md
│   ├── commands/                # custom slash commands
│   └── settings.json
├── docs/
│   ├── decisions/               # ADRs, numbered (0001-*.md, 0002-*.md, ...)
│   ├── runbooks/                # ops procedures (deploy, debug, recover)
│   └── conventions/             # detailed convention docs (referenced via @imports)
├── apps/
│   └── web/                     # Next.js frontend
│       ├── AGENTS.md            # scoped to this app
│       └── README.md
├── services/
│   └── orchestrator/            # Bun + Hono orchestrator
│       ├── AGENTS.md
│       └── README.md
├── packages/
│   ├── shared/                  # types, constants, utilities
│   └── acp-host/                # ACP integration code
├── templates/
│   └── react-phaser-game/       # POC template
├── infrastructure/
│   ├── docker/                  # Dockerfiles for sandbox base images
│   ├── caddy/                   # reverse proxy config
│   └── deploy/                  # deploy scripts, VPS setup
└── scripts/
```

### AGENTS.md at the root

The primary cross-tool agent-context file. AGENTS.md is the open standard governed under the Linux Foundation and supported natively by Codex, Cursor, Cline, Zed, Aider, and most other agentic coding tools. Keeping it as the primary file means any contributor working with any agent gets coherent guidance from the start.

Contents (kept under 200 lines; longer detail moved into `docs/` and referenced):

- One-line project description
- Build and test commands (exact strings)
- Code style summary (TypeScript strict, named exports, Biome formatting)
- Architecture summary (one paragraph; longer detail in ARCHITECTURE.md)
- Key conventions (error handling, logging, naming)
- Things the agent should never do (e.g. modify OAuth token handling without review; commit credentials)
- References to `docs/conventions/*.md` for detail

### CLAUDE.md at the root

Short file (a few lines) that imports AGENTS.md plus any Claude-Code-specific additions. The canonical pattern recommended for mixed-agent projects:

```markdown
# CLAUDE.md
@AGENTS.md
@docs/conventions/claude-code-specific.md
```

This avoids maintaining two parallel instruction sets while still letting Claude Code pick up Claude-Code-specific guidance (skill discovery, slash command usage, hook conventions) where it differs from generic agent guidance.

### Scoped AGENTS.md files

Each major sub-folder (apps/web, services/orchestrator) has its own AGENTS.md with conventions specific to that area. Agents discover the closest AGENTS.md to the file being edited; root-level instructions apply globally, scoped instructions apply within their directory. This keeps each file short and contextually relevant.

### `.claude/skills/`

Project-specific skills for common workflows. Each skill is a directory containing `SKILL.md` with YAML frontmatter. Initial skills:

- `add-template/SKILL.md` — how to add a new project template, including conventions and file layout
- `work-with-acp/SKILL.md` — patterns for working with the ACP integration code
- `work-with-mcp/SKILL.md` — patterns for adding or modifying MCP servers

Skills evolve as the codebase does. Each is a small reusable unit of agent guidance, invokable when the agent recognises the relevant context.

### Architecture Decision Records

Lightweight ADRs in `docs/decisions/`, numbered sequentially. Format:

```markdown
# 0007 - Adopt ACP for agent integration

Date: 2026-05-20
Status: Accepted

## Context
[Problem and constraints.]

## Decision
[What we are doing.]

## Consequences
[What becomes easier, what becomes harder, what is now true.]

## Alternatives considered
[Brief notes on what else we looked at.]
```

Half a page is enough. ADRs are written when a decision crosses component boundaries, introduces a new external dependency, or chooses between non-obvious alternatives. They are read by both humans and agents working on the code.

### Development MCP servers

In addition to the per-template MCP servers users get inside their projects (covered in Section 5), the team configures MCP servers for its own development workflow. The principal one is GitHub's official MCP server (`github/github-mcp-server`), which exposes the full GitHub API — Issues, Pull Requests, Projects v2, and Actions — to whichever agent the contributor is running.

Both contributors configure the GitHub MCP server in their Claude Code and Codex setups. Either the remote endpoint (`https://api.githubcopilot.com/mcp/`) or the self-hosted Go binary works. Auth is via personal access token or OAuth, and the server automatically filters tools to those the token has scopes for. Where supported by the agent, the MCP configuration is committed to the repo (e.g. `.mcp.json` for Claude Code) so both contributors get the same setup on clone.

The implication is concrete: the roadmap lives on GitHub Projects as the canonical source. An agent session can read issue state, move items between columns, update field values, create new issues from work-in-progress, or post status updates — all through the same MCP host that runs the rest of the agent's tools. No `TODO.md` or roadmap JSON to keep in sync.

### Why this matters

The documentation conventions are not bureaucratic overhead. They are the single most effective lever on agentic coding productivity in a codebase. A repository with a well-formed AGENTS.md, clear skill files, and current ADRs produces dramatically better output from any agent than one without — including, in the long run, the platform's own users when they fork or learn from our code.

---

## 4. ACP Integration

ACP — the Agent Client Protocol — is the standardised JSON-RPC protocol for editor and host applications to communicate with AI coding agents. Claude Code and OpenAI Codex CLI both speak ACP natively.

### Why ACP

Adopting ACP rather than a custom integration layer:

- Removes per-agent protocol work; Claude Code, Codex, and future ACP-supporting agents work through the same interface
- Aligns with Zed and JetBrains as the protocol's other major hosts; the ecosystem and tooling are maturing
- Reduces the surface area we maintain; the protocol evolves under multi-party governance
- Lets engineering focus on what is genuinely differentiated — multi-user attribution, prompt queueing, template integration, learning surfacing

The platform customises only where it genuinely differentiates. The ACP layer itself is library-grade; the work is the surrounding application.

### Implementation

The Orchestrator includes an ACP host module (in `packages/acp-host/`) that:

- Spawns Claude Code as a subprocess inside the project's Docker container
- Negotiates the ACP session over stdio
- Translates platform-level prompt events into ACP messages
- Receives ACP events (text chunks, tool calls, file changes) and broadcasts them to the project room
- Handles ACP session lifecycle: initialise, prompt, tool permission, complete, shutdown

Existing open-source ACP libraries are evaluated first. If they suffice, they are used directly; if they need extension for multi-user attribution, the platform contributes upstream or maintains a minimal fork.

### Multi-user attribution

ACP assumes single-host single-user interaction. The platform's two-user model layers on top:

- Each user's prompt is wrapped with an attribution header (invisible to the agent but recoverable from the transcript) before being sent over ACP
- The ACP session is shared between users in the same project; a queue ensures one active turn at a time
- Events emitted by the agent are broadcast to both users; the prompting user's identity is attached at the broadcast layer

---

## 5. MCP for Specialised Capabilities

MCP — the Model Context Protocol — is the open standard for exposing tools and data to agents. Templates declare which MCP servers they enable; the main agent (Claude Code) discovers and uses them as tools when needed.

### POC scope

One MCP server: image generation via the OpenAI Image API. Enabled in the React/Phaser template. The MCP server runs as a co-process accessible to the agent inside the project container; the agent calls its `generate_image` tool when conversation context requires an image.

For the POC, the MCP server uses the founders' OpenAI API key (configured as an environment variable on the VPS). Cost is small at POC scale and absorbed personally.

### Future MCP servers

The pattern generalises. Subsequent templates may enable:

- Deployment helper (when real deploy lands)
- Test generator and runner
- Design tokens and theme generator
- Stock content (placeholder text, sample data)

Each MCP server is a standalone module under `infrastructure/mcp-servers/`, with its own AGENTS.md describing how the agent should interact with it.

---

## 6. Sandbox Layer

### POC implementation

A single VPS (Hetzner or equivalent) running:

- A Docker daemon
- The Orchestrator (Bun + Hono) as a systemd service
- Per-project Docker containers spawned on demand

Each project container has:

- A base image with Node, Python, Claude Code, common build tools
- Project files mounted as a volume
- Git initialised in the project directory
- The relevant MCP server(s) running as co-processes
- Network: outbound allowlist (Anthropic API, OpenAI API, npm, PyPI, GitHub for read-only); no inbound except the exposed preview port
- Resource limits: 1 CPU, 2 GB memory, 5 GB disk
- Idle shutdown after 30 minutes of no activity

### Sandbox interface

The implementation is wrapped in an interface that other code consumes:

```typescript
interface Sandbox {
  start(projectId: string, templateId: string): Promise<SandboxHandle>
  exec(handle: SandboxHandle, cmd: string, opts?: ExecOptions): Promise<ExecResult>
  spawn(handle: SandboxHandle, cmd: string, opts?: SpawnOptions): Promise<ProcessHandle>
  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>
  readFile(handle: SandboxHandle, path: string): Promise<string>
  watchFiles(handle: SandboxHandle, cb: (event: FileEvent) => void): Unsubscribe
  exposePort(handle: SandboxHandle, port: number): Promise<string>
  stop(handle: SandboxHandle): Promise<void>
}
```

The `DockerSandbox` implementation is the POC. `E2BSandbox`, `FirecrackerSandbox`, etc. can be added later without changes to consumers. An ADR records the abstraction's design.

### Preview URLs

When the sandbox exposes a port, a Caddy reverse proxy maps it to a unique subdomain. The preview URL is active only while the sandbox is running; idle shutdown stops the URL, restart on next project open brings it back.

---

## 7. Git Integration

Git is a first-class product surface and a first-class internal concern. Every project has a local git repository.

### Setup

Initialised at sandbox start with:

- Initial commit of the template scaffold
- Author identity from the project's creator
- A `.gitignore` appropriate to the template's stack

No remote is configured. Repository state is captured to object storage on sandbox shutdown and restored on next start.

### Agent auto-commit policy

The agent commits at meaningful stages, not every turn. Specifically:

- After completing a coherent task (one or more file changes that constitute a logical unit of work)
- Before potentially destructive operations (significant deletions, refactors)
- On explicit user request

Commit messages are written by the agent using a prompted convention (imperative mood, concise, references the task). Commits are attributed to the prompting user via git author metadata.

The policy is enforced via guidance in the agent's system prompt and an associated skill — not by hardcoded platform behaviour. This means it can be refined easily and the agent retains its native git competency.

### UI surface

The workspace includes a git panel showing:

- Current branch
- Recent commits with author, message, timestamp
- Working tree state (uncommitted changes)
- Diff view (file-level and line-level)
- Revert action with confirmation

Terminology is the standard git terminology — commit, branch, diff, revert — accompanied by in-product info tooltips and links to learning content. The platform teaches git; it does not abstract it away.

### Agent use of git

The agent can use git for its own purposes via the standard shell tool: `git log` to understand recent history, `git revert` or `git reset` to undo its own destructive operations, `git diff` to review changes before committing. This is normal Claude Code behaviour in a git repo; the platform biases the agent toward using it via system prompt guidance.

---

## 8. Real-time Coordination

Single WebSocket per user to the Orchestrator. Per-project rooms.

Client → server messages: `subscribe`, `prompt`, `file_lock`, `file_unlock`, `cursor`, `git_action`, `presence`.

Server → client messages: `agent_event` (streamed ACP event), `partner_prompted`, `file_changed`, `git_state_updated`, `presence`, `sandbox_state`, `queue_position`, `error`.

For the POC, file-level locking is sufficient. Character-level co-editing via Yjs is in the immediate post-POC phase.

---

## 9. Data Model

POC subset. Anything not needed for the POC is not built.

```sql
-- NOTE: STORY-04 added Better Auth (`session`, `verification`, plus
-- `email_verified` / `image` / `updated_at` on `users`) and DROPPED
-- `auth_sessions` and `magic_link_tokens`. See ADR-0005 for the
-- override; canonical schema lives in `packages/db/src/schema.ts`.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,        -- added STORY-04
  display_name TEXT,
  image TEXT,                                            -- added STORY-04
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()                   -- added STORY-04
);

-- STORY-04 (Better Auth) owns these two:
CREATE TABLE session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- DROPPED (see ADR-0005):
-- CREATE TABLE auth_sessions ...
-- CREATE TABLE magic_link_tokens ...

CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_memberships (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  harness TEXT NOT NULL DEFAULT 'claude-code',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  container_id TEXT,
  preview_url TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_events_project_time ON events (project_id, created_at);

CREATE TABLE agent_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  prompting_user_id UUID REFERENCES users(id),
  prompt_text TEXT NOT NULL,
  response_text TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE learning_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  topic TEXT NOT NULL,
  source TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);
```

No skills, no portfolio, no subscriptions, no audit log, no admin tables in the POC. Those tables are added in the post-POC phase as their features are built.

---

## 10. Authentication and OAuth

### POC auth

Magic-link auth: user enters email, platform sends magic link, click creates a session. No password, no MFA, no email verification flow beyond clicking the link. Sufficient for a small group of university testers; full email/password and MFA are added when productisation proceeds.

### Anthropic OAuth

For Claude Code agent access. Standard OAuth flow:

1. User clicks "Connect Anthropic" on settings page
2. Redirect to Anthropic OAuth endpoint with platform's client ID and required scopes
3. User authenticates with Anthropic, consents to scopes
4. Anthropic redirects back with authorisation code
5. Platform exchanges code for access and refresh tokens
6. Tokens stored encrypted in `oauth_tokens` table
7. At session time, the Orchestrator retrieves the prompting user's token, refreshes if needed, and passes it to Claude Code via environment variable when spawning the subprocess

OpenAI OAuth follows the same pattern, added alongside Codex in the next phase.

---

## 11. Templates

### POC template

A single template: React/Phaser web game. Chosen because:

- Visually rewarding output (encourages test users to finish)
- Naturally exercises image generation via MCP
- Familiar stack components for both founders
- Doesn't require a backend to be interesting

Template structure:

```
templates/
└── react-phaser-game/
    ├── template.json
    ├── AGENTS.md                # template-specific guidance for agents
    ├── scaffold/                # initial project files
    ├── mcp-servers.json         # declares enabled MCP servers
    └── sandbox.json             # Docker base image, ports, env
```

`template.json`:

```json
{
  "id": "react-phaser-game",
  "name": "Web Game (React + Phaser)",
  "description": "Build a 2D browser game with React and Phaser.",
  "harness": "claude-code",
  "tags": ["game", "frontend"],
  "preview_port": 5173,
  "stack_summary": "React, Phaser 3, Vite, TypeScript"
}
```

The template's AGENTS.md gives Claude Code template-specific guidance (Phaser conventions, asset organisation, how to use the image-generation MCP server when needed).

---

## 12. Roadmap

### POC — 1 month

Week-by-week sequencing. Not strict gates; guidance.

**Week 1 — Foundations.** Public GitHub repo with the monorepo structure and documentation conventions (AGENTS.md, CLAUDE.md, ADR template, initial skills) in place. Cloudflare Pages frontend skeleton. Postgres schema deployed. Magic-link auth flow working. VPS provisioned with Docker and Bun. Orchestrator skeleton accepting WebSocket connections.

**Week 2 — Agent integration.** Anthropic OAuth flow. ACP host code in the Orchestrator. `DockerSandbox` implementing the `Sandbox` interface. Spawn Claude Code in a project container, exchange a hello-world prompt, see the response stream back. Project file persistence on sandbox stop, restore on start.

**Week 3 — Workspace.** Three-panel workspace UI. Real-time sync via WebSocket. File-level locking. Per-user cursors and presence. Prompt queue logic across two users. Preview URL exposure and Caddy proxying.

**Week 4 — Template, git, polish.** React/Phaser template fully built and tested. Image-gen MCP server working. Git panel UI (commit log, diff, revert). Agent auto-commit prompt guidance tuned. Curated learning links surface. Internal dogfood test (founders pairing). Onboard one or two university student pairs.

### Immediate post-POC phase — 4 to 6 weeks

- OpenAI OAuth and Codex CLI via ACP as second supported agent
- Second template using Codex
- Yjs-based real-time co-editing in Monaco
- Follow mode (one user follows the other or the agent)
- Per-user undo history
- Skills system (Claude Code `.claude/skills/` integration in user projects)
- Profile and portfolio surfaces
- Refined learning content with progress tracking

---

## 13. Verification

Lightweight for the POC.

**End-to-end pair flow.** Two test users sign up, link Anthropic, accept an invite, create a project, prompt the agent, see the result, view the preview.

**Sandbox lifecycle.** Project opens, container starts, prompts work, idle timeout, container stops, reopen, state restored.

**Git correctness.** Auto-commits at expected stages; revert works; diff displays correctly.

**Image MCP.** Agent calls the image-generation tool when prompted with image-relevant context; image returned and saved to the project.

Lightweight CI: lint, TypeScript type check, a small smoke test (start the orchestrator, hit a health endpoint, run a single mocked ACP round-trip). Under two minutes per PR.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| One month is tight for two part-time contributors | Tight scope (one template, one harness, no profile/portfolio), hard prioritisation, cut features rather than slip the deadline |
| ACP protocol changes during build | Pin to a specific ACP version; track upstream changes; budget post-POC time to upgrade if needed |
| Claude Code CLI behaviour differs from expectations | Spike ACP integration in week 1; pivot quickly if needed |
| Image generation MCP costs add up | Hard usage caps in the MCP server; monitor weekly |
| University testers too technical to be representative | They validate "does it work," not "is this the right product"; real user validation is later |

---

## 15. What is not in the POC

For clarity. Each of these is in the immediate post-POC phase or later.

- Codex integration and second template
- Yjs / character-level co-editing
- Skills system
- Profile and portfolio surfaces
- Follow mode and per-user undo
- Voice chat
- Multiple templates
- Billing, subscriptions, tiers
- Admin console
- Full auth (email/password, MFA)
- E2B or other paid sandbox infrastructure
- Persistent preview between sessions
- Real deployment to hosting platforms
- Mobile UI
- SSO / enterprise features

---

## 16. Summary

The POC ships in one month with one template, Claude Code via ACP, Docker sandboxing on a single VPS, magic-link auth, Anthropic OAuth, a three-panel collaborative workspace, basic git integration, and image generation via MCP. Documentation conventions (AGENTS.md, CLAUDE.md, skills, ADRs) are part of the codebase from day one. Two open standards — ACP and MCP — and free or open-source infrastructure throughout. Stack abstractions in place so scaling and swap-ins are paths forward, not rewrites.
