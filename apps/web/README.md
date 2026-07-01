# @praxis/web

The Praxis Next.js frontend — landing page, sign-in flow, dashboard, and the
collaborative workspace UI.

## Quick start

```bash
pnpm install            # from the repo root, installs all workspaces
pnpm --filter web dev   # serves http://localhost:3000
```

## Build

```bash
pnpm --filter web build     # standalone output → apps/web/.next/standalone
pnpm --filter web start     # serve the production build on :3000
```

The `output: 'standalone'` setting in `next.config.ts` is required by the
Dockerfile (TASK-006 onward). Do not remove it.

## Stack

- Next.js 14 App Router + TypeScript
- shadcn/ui (slate base) — components hand-installed under `components/ui/`
- Tailwind 3.4
- React 18

## Conventions

- Path alias: `@/*` → `apps/web/*` (set in `tsconfig.json`).
- Linting: the repo-wide `pnpm lint` (Prettier + ESLint flat config at root)
  covers this workspace. We don't run `next lint` separately —
  `eslint-config-next` doesn't yet support ESLint 9 (the version pinned at
  root). When upstream catches up, we can opt back in.
- Add a shadcn component by hand (component file under `components/ui/`,
  any new CSS variables in `app/globals.css`). Avoid `pnpm dlx shadcn add`
  in CI — it's interactive.

See `../../AGENTS.md` for project-wide rules.
