# 0003 — Prettier + ESLint over Biome

**Date:** 2026-05-31
**Status:** Accepted

## Context

`docs/project_plan.md` §3 (AGENTS.md contents row: "TypeScript strict, named exports, Biome formatting") and `docs/development_strategy.md` §"Branching strategy → CI" ("Lint (Biome)") both name **Biome** as the lint+format tool. The decision was made early without exploring tradeoffs.

During STORY-01 (TASK-001 scaffolding) we noticed the autodev cycle already has a Stop hook that runs Prettier:

```javascript
// .claude/hooks/stop-format-check.mjs
const PRETTIER_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|html)$/;
if (!existsSync(resolve(PROJECT_ROOT, 'node_modules', '.bin', 'prettier'))) {
  // Skip if prettier isn't installed.
}
execSync(`npx prettier --check ${...}`);
```

The hook is **dormant when Prettier isn't installed** and **active when it is**. Picking Biome would mean either:

1. **Swap the autodev hook** to call `biome format` instead. Doable, but it diverges from the autodev-template upstream and we'd absorb future upstream changes manually.
2. **Install Prettier alongside Biome** with a `.prettierrc` mirroring Biome's settings. Two formatters in parallel; ongoing config-drift risk; every change to one config needs to be mirrored to the other.
3. **Leave the hook dormant** (don't install Prettier). Lose the session-end formatting safety net.

Biome's actual strengths — **single tool for lint + format, written in Rust (~10–25× faster than Prettier+ESLint), one config file** — are real but not load-bearing for a 12-workspace POC. On a fresh install in the Praxis repo, `prettier --check . && eslint .` runs in **~2.6 seconds** on cold cache (CI: 1.8s with cache). Speed is not the bottleneck.

Meanwhile Prettier+ESLint wins on:

- **Ecosystem maturity:** shadcn/ui examples ship with Prettier; `prettier-plugin-tailwindcss` is the de-facto standard for Tailwind class sorting (Biome added built-in support in 1.8 but the ecosystem expects Prettier); ESLint's React/TypeScript rule surface is broader than Biome's.
- **Existing autodev infra alignment:** the `stop-format-check.mjs` hook works without modification.
- **Lower cognitive surprise for new contributors:** most TS contributors arrive knowing Prettier; Biome would be a "learn this tool too" moment.

## Decision

Praxis uses **Prettier 3 + ESLint 9 (flat config)** for formatting and linting.

- `.prettierrc.json` at the repo root: single quotes, trailing commas, 100-column print width, semicolons.
- `eslint.config.js` (flat config): `@eslint/js/recommended` + `typescript-eslint/recommended`.
- `.prettierignore` scopes formatting to project-authored files. Autodev-template-provided files (`.claude/hooks/`, `.claude/skills/`, `roadmap/`, `memory-seeds/`, `systemd/`, `docker/`, template-shipped `scripts/*`) keep their upstream style.
- CI runs `pnpm lint` which is `prettier --check . && eslint .`.
- `pnpm format` is the local fix command (`prettier --write . && eslint . --fix`).

## Consequences

- **Easier:** the autodev `stop-format-check.mjs` hook works out of the box once `node_modules/.bin/prettier` exists. No upstream divergence.
- **Easier:** `prettier-plugin-tailwindcss` slots in when STORY-02 adds Tailwind without changing the formatter.
- **Harder:** two tools (Prettier for format, ESLint for lint) instead of one. Two configs to maintain. Acceptable; both are mainstream and well-documented.
- **Slower:** local `pnpm lint` is ~2.6s on cold cache vs. ~0.2s a hypothetical Biome would be. Not a developer-experience bottleneck.
- **Now true:** `AGENTS.md` (Tech stack section), `.claude/project.json` (`commands.lint`), `.github/workflows/ci.yml` (Lint step), and the AGENTS.md "Code style summary" all name Prettier+ESLint. This ADR is the canonical record of the override.
- **Reversibility:** swapping to Biome later means deleting `.prettierrc.json` / `eslint.config.js`, adding `biome.json`, updating the three references above, and either swapping or accepting drift with `stop-format-check.mjs`. Bounded one-PR change; the eventual Biome adoption decision can be revisited as the ecosystem matures.

## Alternatives considered

- **Biome 1.9.x (original plan, single tool).** Faster, one config, but conflicts with the autodev hook and adds Tailwind-class-sorting risk. Re-evaluate when Biome's Tailwind plugin parity is uncontested and a stop-format hook upstream supports Biome natively.
- **dprint.** Pluggable formatter, fast, supports Prettier-like rules. Smaller ecosystem; same autodev-hook divergence problem. Rejected on ecosystem grounds.
- **ESLint-only with `eslint --fix` for formatting.** Mixes formatting concerns into ESLint. Industry consensus has moved away from this since Prettier 1.x. Rejected.

Supersedes the lint+format tool selection in `docs/project_plan.md` §3 ("Biome formatting") and `docs/development_strategy.md` §"Branching strategy → CI" ("Lint (Biome)").
