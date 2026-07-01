# Handoff: Praxis — Neo-Brutalist × Academia redesign

## Overview
A full visual + interaction redesign of **Praxis** (the collaborative AI build
platform for pairs). The direction is **academia-forward, brutalism as structure**:
a scholarly serif on warm parchment, ink-black thick borders, square corners, and
hard offset drop-shadows — with a single oxblood "red-pen" accent and a chalkboard
dark mode. Wording is deliberately plain and non-technical.

It covers every surface: **Landing, Sign-in, Projects (dashboard), New project,
and the Workspace** (Files · Code/Preview/Git/Usage · Chat), plus the reworked
collaboration model ("take turns" / "anyone"), the chat-as-history, the
learn-as-you-go panel, and live presence.

## About the design files
The files in this bundle are **design references created in HTML/React+Babel** —
prototypes showing the intended look and behaviour. **They are not production code
to copy directly.** The task is to **recreate this design inside the existing
`apps/web` codebase** (Next.js 14 App Router + Tailwind + shadcn/ui) using its
established patterns — not to ship the HTML. The single exception is
`globals.css` (see below), which is written *against your repo's existing
shadcn variable contract* and can be adapted almost verbatim.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, borders, shadows, and
interactions are all specified. Recreate the UI faithfully using the repo's
existing component library (shadcn/ui), re-skinned via the tokens below.

---

## How to apply it to the repo (the short version)
1. **Tokens** — replace `apps/web/app/globals.css` with the provided
   `globals.css` (it keeps your existing shadcn HSL-variable names, so every
   shadcn component re-themes for free; it only changes the *values* + adds a
   few extras and sets `--radius: 0`).
2. **Fonts** — add **Newsreader** (serif, display + body) and **Space Mono**
   (labels + code). Prefer `next/font/google` in `apps/web/app/layout.tsx`:
   ```ts
   import { Newsreader, Space_Mono } from 'next/font/google';
   const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' });
   const mono  = Space_Mono({ subsets: ['latin'], weight: ['400','700'], variable: '--font-mono' });
   // add `${serif.variable} ${mono.variable}` to <body className>
   ```
   Then in `tailwind.config`: `fontFamily: { sans: ['var(--font-serif)'], serif: ['var(--font-serif)'], mono: ['var(--font-mono)'] }`.
   (The provided globals.css also has an `@import` fallback you can delete once next/font is wired.)
3. **Brutalist component pass** — the shadcn defaults are soft (1px borders,
   blurred shadows, rounded). Apply these repo-wide adjustments:
   - **Borders:** default to `border-2` on cards, inputs, buttons, panels (the
     `--border` token is now ink, so borders read as the design intends).
   - **Radius:** `--radius: 0` makes everything square — keep it; remove any
     hard-coded `rounded-*` on primitives.
   - **Shadows:** swap blurred shadows for the hard offset. Use the provided
     `.shadow-hard` utility (`4px 4px 0` ink) on cards, popovers, primary
     buttons. No blur anywhere.
   - **Buttons** (`components/ui/button.tsx`): add the press-down feel —
     `shadow-hard` at rest, `hover:-translate-x-px hover:-translate-y-px`,
     `active:translate-x-[4px] active:translate-y-[4px] active:shadow-none`,
     and `uppercase tracking-wide font-mono text-xs` for the label.
   - **Labels / meta / call-numbers / timestamps / file paths:** use the
     `.label-mono` utility or `font-mono uppercase tracking-[0.16em] text-xs`.
   - **Stamps/badges:** use `.stamp` / `.stamp-solid` for status pills
     (Live / Ready / Selected, etc.).
   - **Avatars:** no photos — square monogram initials
     (`border-2 size-7 grid place-items-center font-mono text-xs`),
     ink-filled for the current user, oxblood for the AI assistant.

A complete component-by-component checklist is in **`CLAUDE_CODE_PROMPT.md`**,
written as a paste-ready prompt for Claude Code to implement and open the PR.

---

## Design tokens

### Colour — light (parchment)
| Role (shadcn var) | Hex | HSL triplet |
|---|---|---|
| `--background` paper | `#f1e8d2` | `43 53% 88%` |
| `--secondary`/`--muted` leaf | `#e8dcc0` | `42 47% 83%` |
| `--accent` (hover fill) | `#ddcfa8` | `44 44% 76%` |
| `--popover` field/well | `#f7f0de` | `43 61% 92%` |
| `--foreground`/`--border`/`--primary` ink | `#1d1810` | `37 29% 9%` |
| ink-2 (secondary text) | `#4a4234` | `38 17% 25%` |
| `--muted-foreground` | `#7c715b` | `40 15% 42%` |
| `--destructive`/`--stamp`/`--ring` oxblood | `#97331f` | `10 66% 36%` |

### Colour — dark (chalkboard)
| Role | Hex | HSL triplet |
|---|---|---|
| `--background` board | `#181b16` | `96 10% 10%` |
| `--card`/`--muted` slate | `#20241d` | `94 11% 13%` |
| `--accent` | `#2b3027` | `93 10% 17%` |
| `--foreground`/`--border`/`--primary` chalk | `#ece2cb` | `42 46% 86%` |
| `--muted-foreground` | `#8c8470` | `43 11% 49%` |
| `--destructive`/`--stamp` chalk-red | `#d4694f` | `12 61% 57%` |

### Type
- **Display + body:** Newsreader (400/500/600/700 + italic). Headlines 600,
  tight tracking (`-0.015em`). Italic serif is used for project titles and
  marginal notes.
- **Mono:** Space Mono (400/700) for labels, call-numbers, timestamps, file
  paths, code, and button text.
- Scale (px): display 92–116 (landing/overview), h1 32–42, h2 24–28,
  body 15, meta/label 10.5–13, code 12.5/line-height 22.

### Spacing / structure
- Border weight: **2px** (token `--bw`). Border colour = ink/chalk.
- Corner radius: **0** (`--radius: 0rem`).
- Hard shadow: **`4px 4px 0`** ink (token `--sh`; `.shadow-hard`). Buttons 3px;
  small chips 2px. No blur, ever.
- Density tweak (optional): a `data-density="compact"` attribute reduces base
  font-size to 13.5px and tightens button/input/tab padding.

---

## Screens / views (recreate these)

**Landing** — two-column: oversized "Praxis" wordmark + italic tagline + CTAs
(Get started / How it works) on a faint ruled-paper background; right column is a
numbered "How it works" list (I–IV in oxblood). Top nav: wordmark, How it works /
Templates / Pricing, Sign in.

**Sign-in** — centred card with an ink "envelope flap" header. Email field →
"Email me a link" → "Check your inbox" confirmation with an "I clicked the link"
button (magic-link, no password). Stamp: "No password needed".

**Projects (dashboard)** — top bar (wordmark, Projects/Profile/Settings,
light-dark toggle, monogram). "Your projects" + "New project". Active/Archived
tabs, live search, and a **List ↔ Bookshelf** view toggle. List = ledger table
(# · Project · People · Status · Opened · Open). Bookshelf = vertical book
*spines* (call-number, vertical italic title, live-dot), sitting on an ink shelf.

**New project** — name field (large italic), a row of selectable **template
cards** (Web game / SaaS dashboard / 3D scene / Blank; selected card gets an
oxblood hard-shadow + ink header + "✓ Selected" stamp), invite-a-partner email,
Create project.

**Workspace** — three columns:
- **Files** (left): "Files" header + Invite; "Who's here" presence (monogram +
  what file they're viewing); a file tree where another person's open file shows
  their initials; clicking a file opens it in the editor.
- **Workbench** (centre): folder tabs **Code / Preview / Git / Usage**.
  - *Code* — monospace editor with line numbers; another author's live cursor is
    a coloured caret + name tag.
  - *Preview* — live running app in a bordered frame (here: a tide-pool guide
    with a bar chart; low values in oxblood) + a "Live preview" stamp + URL.
  - *Git* — uncommitted changes (file · +adds −dels), a commit message field +
    "Commit & push", and a vertical history timeline.
  - *Usage* — budget meter ($ used / budget, % bar in oxblood) + per-session
    cost breakdown; copy explains BYO-subscription metering.
- **Chat** (right): header "Chat" + the turn-taking control. Numbered, attributed,
  time-stamped messages; the AI is "Assistant" (oxblood monogram) and its replies
  carry small file-change annotations (pen/✎ wrote chart.tsx · +18). Input:
  "Message the assistant…" + Send. Below: a collapsible **Learn · Suggested
  reading** list with checkable items and a x/5 read count.

## Interactions & behaviour
- **Routing:** Landing → Sign-in → Projects → New project / Workspace, with back
  navigation; persist current screen + project in storage so refresh resumes.
- **Turn-taking (collaboration):** two modes — *Take turns* (one person "in
  control"; others request/are passed a turn; non-holders see "X is prompting…"
  and a disabled input) and *Anyone* (everyone can prompt, messages queue). The
  control indicator + mode toggle live in the workspace masthead.
- **Chat:** sending appends the user message, then (after a short delay) an
  assistant reply with optional file-change annotations; a written-file briefly
  highlights in the file tree.
- **Tabs / files:** Code/Preview/Git/Usage switch instantly; clicking a file
  opens it. Keep Preview mounted so the running app isn't reloaded on tab switch.
- **Theme:** light/dark toggle flips `.dark` on the root.
- **Tweakable (optional, nice-to-have):** accent colour, border weight, shadow
  depth, typeface, density — all driven by the CSS vars above.

## State management
Per the existing app: WebSocket-driven session, prompt queue + attribution,
presence, control-handoff state, file watch, usage metering. The redesign does
not change the data model — only presentation + the control-mode UX. The
prototype's local state (screen, current project, messages, control holder,
active file, tab, theme) maps onto the existing providers in
`apps/web/components/workspace/*`.

## Assets
No raster assets. Icons are simple geometric strokes (recreate with `lucide-react`
already implied by shadcn, or keep the simple inline SVGs). Imagery uses
striped placeholders with mono captions until real content exists.

## Files in this bundle
- `globals.css` — **the deliverable** — repo-ready theme (replace
  `apps/web/app/globals.css`, keep your `@layer base { *{@apply border-border} }`).
- `CLAUDE_CODE_PROMPT.md` — paste-ready prompt for Claude Code to implement the
  full pass and open the PR.
- `praxis.css` — the complete design language (tokens + every primitive) as the
  source of truth for values.
- `Praxis Prototype.html` (+ `proto-bundle.jsx`, `tweaks-panel.jsx`) — the
  interactive prototype. Open it to see all flows and states.
- `Praxis Redesign.html` (+ `praxis-bundle.jsx`, `design-canvas.jsx`) — the
  design-system canvas (foundations + every screen, light & dark).

Open the two HTML files directly in a browser to explore the intended result.
