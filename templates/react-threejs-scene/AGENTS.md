# AGENTS.md — React + Three.js scene

> Template-specific guidance loaded by Claude Code on its first turn in this
> workspace. Conventions for building a 3D web scene with React Three Fiber.

## Stack

- **Vite + React 18 + TypeScript** (strict). Entry: `src/main.tsx` → `src/App.tsx`.
- **three.js** via **@react-three/fiber** (`<Canvas>`, hooks like `useFrame`) and
  **@react-three/drei** helpers (`OrbitControls`, loaders, etc.).
- Dev server: `npm run dev` (Vite on port **5173**, bound to `0.0.0.0` so the
  preview URL is reachable). `npm run build` type-checks + builds.

## Conventions

- Build the scene declaratively as components rendered inside `<Canvas>`. Drive
  per-frame animation with `useFrame((state, delta) => …)`, not `setInterval`.
- Keep a single `<Canvas>`; compose meshes/lights/controls as children. Hold
  mutable three objects in `useRef` (e.g. `useRef<Mesh>(null)`), not state.
- Prefer `<meshStandardMaterial>` + at least one light; the default scene has an
  ambient + a directional light. Add `<OrbitControls />` (drei) for navigation.
- Units are metres-ish; keep the camera a few units back (`position={[3,3,3]}`).

## Textures & assets

- Put image assets under `public/textures/` and load them with drei's
  `useTexture('/textures/<file>.png')`. The **image-gen MCP server** is available —
  use it to generate textures/sprites when the user asks, then save into
  `public/textures/`.
- Load GLTF/GLB models with drei's `useGLTF` from `public/models/`.

## Committing your work

Commit as you go so the git panel tells the story of how the app was built — your
pair (and their portfolio) can see each step.

- **When to commit, without being asked:**
  - after finishing a coherent unit of work (a feature, a fix, a refactor that
    builds and runs);
  - **before** any destructive or risky move (deleting files, large rewrites,
    `git reset`) so there's a safe point to return to;
  - whenever the user asks to "save", "checkpoint", or "commit".
- **How to write the message** — imperative mood, concise, says what changed and
  why it matters; reference the work, not the mechanics:
  - ✅ `Add a rotating textured cube with orbit controls`
  - ✅ `Fix texture seams on the floor plane`
  - ❌ `update`, `wip`, `changes`, `fixed stuff`
- **How to commit:** stage everything and commit in one step —
  `git add -A && git commit -m "<imperative message>"`. Don't commit secrets or
  generated junk (`node_modules/`, `dist/` are already git-ignored).
- Run `/commit-checkpoint` for the full checklist, or just follow the above.

## Don't

- Don't add a second `<Canvas>` or render three objects outside one.
- Don't block the render loop with synchronous heavy work; suspend with
  `<Suspense>` around async loaders.
- Don't let work pile up uncommitted — a checkpoint after each meaningful change
  beats one giant commit at the end.
