# Paste-ready prompt for Claude Code

Run this from the root of the `praxis` repo (with the `design_handoff_praxis_neobrutalist/`
folder copied in, or its contents to hand). It implements the redesign in
`apps/web` and opens a PR.

---

You are restyling the **Praxis** web app (`apps/web` — Next.js 14 App Router,
Tailwind, shadcn/ui) to a **Neo-Brutalist × Academia** look: scholarly serif on
warm parchment, ink-black 2px borders, square corners, hard offset drop-shadows
(no blur), one oxblood accent, and a chalkboard dark mode. Wording stays plain.
Use the design references in `design_handoff_praxis_neobrutalist/` — open
`Praxis Prototype.html` and `Praxis Redesign.html` to see the target; lift exact
values from `globals.css`, `praxis.css`, and `README.md`. **Recreate the design
in the existing components; do not import the HTML.**

Do this on a new branch and open a PR:

1. `git checkout -b redesign/neobrutalist-academia`

2. **Theme tokens.** Replace the `:root` and `.dark` blocks + base layer of
   `apps/web/app/globals.css` with the values from
   `design_handoff_praxis_neobrutalist/globals.css` (it preserves the existing
   shadcn variable names, sets `--radius: 0rem`, makes `--border`/`--input` ink,
   `--destructive`/`--ring` oxblood, and adds `--stamp`, `--paper-2/3`, `--shadow`,
   `--bw`, `--sh`, the `.shadow-hard` / `.label-mono` / `.stamp` utilities, and the
   recoloured Monaco peer-cursor classes). Keep the existing
   `@layer base { * { @apply border-border } body { @apply bg-background text-foreground } }`.

3. **Fonts.** Wire `next/font/google` for **Newsreader** (`--font-serif`) and
   **Space Mono** (`--font-mono`, weights 400/700) in `apps/web/app/layout.tsx`;
   add both `.variable`s to `<body className>`. Set Tailwind
   `theme.extend.fontFamily = { sans: ['var(--font-serif)'], serif: ['var(--font-serif)'], mono: ['var(--font-mono)'] }`.
   Delete the `@import` fallback from globals.css once this works.

4. **Brutalist component pass** (match the prototype):
   - `components/ui/button.tsx`: `border-2 rounded-none shadow-hard font-mono text-xs uppercase tracking-wide`,
     `hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--shadow))]`,
     `active:translate-x-[4px] active:translate-y-[4px] active:shadow-none`. Variants:
     `default` = ink fill (primary); add a `stamp` variant = oxblood fill.
   - Cards / popovers / dialogs / inputs / tabs: `border-2 rounded-none`; cards & popovers get `.shadow-hard`; inputs use the field token, focus ring = oxblood hard-shadow.
   - Replace soft status badges with `.stamp` / `.stamp-solid` (Live / Ready / In progress / Draft / Selected).
   - Section/meta labels, timestamps, call-numbers, file paths → `.label-mono` (mono, uppercase, tracked).
   - Avatars: square monogram initials (no images), ink for the current user, oxblood for the AI assistant.

5. **Screen-level layout** to match the references (keep all existing
   functionality, data, and providers — change presentation only):
   - `app/page.tsx` Landing — two-column hero + numbered "How it works".
   - `components/sign-in-form.tsx` — magic-link card with envelope-flap header + "Check your inbox" state.
   - `app/dashboard/page.tsx` + `components/project-list.tsx` — "Your projects" ledger table + Active/Archived + search + a **List ↔ Bookshelf (spines)** toggle; "New project".
   - `components/create-project-form.tsx` — name + selectable template cards + invite + Create.
   - `components/workspace/*` — the three-pane workspace: Files (presence + tree), folder tabs **Code / Preview / Git / Usage**, and Chat with numbered/attributed messages, file-change annotations, the **Take turns / Anyone** control with request-pass-release handoff, and the collapsible **Learn** list. Rename any agent-facing copy to "Assistant" and keep all labels plain/non-technical.

6. Run `pnpm -w lint` and `pnpm -w typecheck` (or the repo's scripts) and fix issues. Verify light + dark.

7. Commit in logical chunks, push, and open a PR titled
   **"Redesign: Neo-Brutalist × Academia theme"** with a summary, a screenshots
   section (light + dark of Landing, Projects, and Workspace), and a note that the
   change is presentation-only (no data-model/API changes). Reference the handoff
   folder for the source design.

Keep diffs focused; don't touch the orchestrator, db, or sandbox packages.
