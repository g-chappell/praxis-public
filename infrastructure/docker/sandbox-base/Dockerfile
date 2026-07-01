# Praxis sandbox base image — the per-project execution environment.
#
# One image shared by all projects at POC (per-template images land in
# STORY-14). Built and tagged as `praxis-sandbox-base:latest`; DockerSandbox
# (packages/sandbox) creates containers from it. The container stays alive on
# `sleep infinity` so the orchestrator can exec/spawn into it on demand.
#
# Build context is the REPO ROOT (so the bundled MCP server source is visible):
#   docker build -t praxis-sandbox-base:latest -f infrastructure/docker/sandbox-base/Dockerfile .

# ── Stage 1: bundle the image-gen MCP server (STORY-15/TASK-044) ──────────────
# esbuild produces a single self-contained index.mjs (deps inlined) so the final
# image needs no node_modules / install step for the server.
FROM node:20-bookworm AS mcp-build
WORKDIR /build
COPY infrastructure/mcp-servers/image-gen/ ./
RUN npm install --no-audit --no-fund && npm run build

# ── Stage 2: the sandbox runtime ──────────────────────────────────────────────
FROM node:20-bookworm

# Tooling per project_plan.md §6: git, common build tools, Python, and
# inotify-tools (powers Sandbox.watchFiles via inotifywait).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    curl \
    inotify-tools \
  && rm -rf /var/lib/apt/lists/*

# The agent stack inside the sandbox (ADR-0009):
#  - @anthropic-ai/claude-code: the Claude Code CLI / Agent SDK runtime.
#  - @agentclientprotocol/claude-agent-acp: the ACP adapter the AcpHost
#    (packages/acp-host) speaks to over stdio. It authenticates with the
#    platform ANTHROPIC_API_KEY injected at spawn time — never a subscription
#    OAuth token. Pinned so the protocol surface can't drift under us.
RUN npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp@0.39.0

# The image-gen MCP server (STORY-15), baked as platform infra OUTSIDE /workspace
# so it never lands in the user's git history. The orchestrator seeds a project
# .mcp.json whose `command: praxis-mcp-image-gen` resolves to this wrapper on PATH
# (ADR-0018). Secrets are NOT here — they arrive via the ephemeral cred file the
# orchestrator writes at runtime (PRAXIS_MCP_CONFIG).
COPY --from=mcp-build /build/dist/index.mjs /opt/praxis-mcp/image-gen/index.mjs
RUN printf '#!/bin/sh\nexec node /opt/praxis-mcp/image-gen/index.mjs "$@"\n' \
      > /usr/local/bin/praxis-mcp-image-gen \
  && chmod +x /usr/local/bin/praxis-mcp-image-gen

# Project files live here, mounted from a per-project Docker volume.
WORKDIR /workspace

# Idle foreground process: keeps the container running with no app of its own
# so DockerSandbox can exec into it. The 30-min idle sweep (TASK-023) stops it.
CMD ["sleep", "infinity"]
