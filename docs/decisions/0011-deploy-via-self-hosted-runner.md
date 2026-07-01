# ADR-0011: Deploy on the VPS via a self-hosted GitHub Actions runner

## Status

Accepted (2026-06-02)

## Context

Deploys built the service image on a GitHub-hosted runner, pushed it to GHCR,
then **SSHed to the VPS** (`appleboy/ssh-action`, later inline `ssh` wrapped in
`nick-fields/retry`) to run `systemctl restart`. The SSH step failed
intermittently with `ssh: connect to host 72.61.207.12 port 22: Connection
timed out` — the image built + pushed fine, only the restart hop failed.

Investigation on the VPS ruled out the obvious causes:

- **Not the host / firewall.** sshd was up and accepting throughout; ufw
  `ACCEPT`s 22/tcp with no rate-limit; no fail2ban / crowdsec / hosts.deny /
  sshd address restrictions. Many GitHub runner IPs authenticated successfully
  in the same windows that others timed out.
- **Not IPv6.** `VPS_HOST` is the bare IPv4 `72.61.207.12` — no DNS, no AAAA in
  the deploy path.
- **Not a concurrent burst.** A serialized, lone deploy job still timed out for
  ~4 min (9 in-job SSH attempts) while a different job connected a minute later.
  The shared-concurrency-group attempt (#142) to serialize made things worse: a
  shared group cancels legitimate concurrent service deploys (GitHub keeps only
  one in-progress + one pending per group). Reverted in #143.

Root cause: **intermittent, per-source-IP path loss between GitHub's Azure
egress and the Hostinger edge.** A GitHub-hosted runner keeps one egress IP for
the whole job, so when a job lands on a "bad" IP every in-job retry reuses it
and fails. Only a *new run* (new runner, new IP) changes the outcome — which is
why manual re-runs sometimes worked. Widening the retry (#143) therefore cannot
reliably fix it; it just fails slower.

You cannot pin a standard GitHub-hosted runner to a fixed egress IP (only paid
larger runners with static IPs can). The only fixes remove the dependency on
"did this job's IP happen to be routable": a self-hosted runner, a pull-based
deploy, or an overlay network (Tailscale/WireGuard).

## Decision

Run the **deploy step on the VPS itself** via a **self-hosted GitHub Actions
runner** (label `praxis-vps`), keeping the image **build on GitHub-hosted
runners**.

- `deploy-web` / `deploy-orchestrator`: a `build` job (`ubuntu-latest`) builds +
  pushes to GHCR; a `deploy` job (`needs: build`, `runs-on: [self-hosted,
  praxis-vps]`) runs `sudo systemctl restart praxis-<svc>.service` locally and
  smoke-tests the live URL.
- `build-sandbox-base`: a single job on the self-hosted runner runs
  `docker build` locally (the image is VPS-local, never a registry) — no more
  scp/ssh.

The runner is installed under `/home/deploy/actions-runner`, runs as the
existing `deploy` user (already in the `docker` group and granted NOPASSWD sudo
for exactly `systemctl restart praxis-{web,orchestrator,postgres}.service`), as
the systemd service `actions.runner.g-chappell-praxis.praxis-vps.service`. No
new privileges were added.

## Consequences

- **No internet SSH in the deploy path** — the intermittent Azure→Hostinger :22
  loss is eliminated; deploys stop flaking.
- **Notifications stay native.** The deploy is still a GitHub Actions job, so
  success/failure shows in the Actions tab and triggers GitHub's normal failure
  notifications. Nothing extra to build.
- **Build stays fast** on hosted runners (buildx + GHA cache); only the
  lightweight restart runs on the box.
- **Deploys serialize naturally** — one runner runs one job at a time, so
  concurrent deploy jobs queue on it (no SSH burst). Per-workflow concurrency
  groups are retained so overlapping runs of the *same* workflow queue.
- **The VPS executes workflow code** (the deploy/build jobs). Acceptable: the
  repo is private and these workflows trigger only on push to `main` /
  `workflow_dispatch`, never on PRs — so untrusted fork/PR code never runs on
  the host. CI (test/lint/build) stays on GitHub-hosted runners.
- The `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` secrets are now **unused** by these
  workflows. Left in place for now; can be removed once nothing references them.
- **New single point of failure / maintenance:** if the runner service is down,
  deploys queue until it returns. Recovery + the one-time install are recorded
  in `docs/runbooks/deploy-web.md` (Setup history).

## Alternatives considered

- **Widen the SSH retry (#143).** Rejected as a fix: in-job retries reuse the
  same blocked egress IP. Kept transiently before this ADR; superseded here.
- **Shared concurrency group to serialize SSH (#142).** Rejected: doesn't fix
  the path loss and cancels legitimate concurrent service deploys.
- **Pull-based deploy** (VPS polls GHCR + self-deploys). Also removes inbound
  SSH, but moves deploy status off GitHub entirely, so we'd have to build our
  own success/failure notifier. More moving parts than reusing GitHub Actions on
  a self-hosted runner.
- **Tailscale/WireGuard overlay.** Keeps hosted runners and routes SSH over a
  stable overlay IP. Viable and keeps prod-host code off the runner, but adds a
  tailnet + auth-key dependency and a daemon on the VPS. Heavier than a
  self-hosted runner for a single-VPS POC.
- **GitHub larger runners with static IPs.** Requires a paid tier; overkill.
