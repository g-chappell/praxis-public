# 0002 — React + Three.js POC template (over React + Phaser)

**Date:** 2026-05-31
**Status:** Accepted

## Context

`docs/executive_summary.md` §"POC phase" and `docs/project_plan.md` §11 name **React + Phaser** as the sole POC template. The selection rationale at the time:

- Visually rewarding output (encourages test pairs to finish)
- Naturally exercises image generation via MCP
- Familiar stack for the founders
- Doesn't need a backend to be interesting

That logic still holds; the template's *job* is unchanged. The question is which 2D-vs-3D framework best amplifies the image-generation MCP server — the most-load-bearing piece of infrastructure in the POC template (`templates/<name>/mcp-servers.json` enables it; STORY-15 builds it; STORY-14's AC depends on the generated output appearing in the running scene).

During STORY-01 we revisited the framework choice. The image-gen MCP emits **PNG textures**, not 2D sprites. The path from `generate_image` → a visible result in the user's scene is the user's primary visual feedback loop. In each framework:

- **Phaser (2D):** the generated PNG becomes a sprite or background. Useful, but sprites benefit from pixel-perfect art that current image-gen models don't reliably produce; backgrounds work but feel static.
- **Three.js (3D, via `@react-three/fiber` + `@react-three/drei`):** the generated PNG becomes a texture loaded onto a mesh in one line (`new THREE.TextureLoader().load(...)`). Skyboxes, ground tiles, and PBR materials all consume textures directly — exactly what image-gen produces, with no "but the image is slightly off" pixel artifacts because the texture is wrapped around 3D geometry.

## Decision

The POC template is **`templates/react-threejs-scene`** — Vite + React + TypeScript + `@react-three/fiber` + `@react-three/drei`. The starter scaffold renders a rotating cube with a skybox slot ready for the first image-gen texture.

## Consequences

- **Easier:** the image-gen MCP server's output has a direct, visible home in the template (`/public/textures/*.png` loaded onto a mesh). The user-prompt → texture → visible-change feedback loop is one tool call instead of "generate the image, then manually edit a sprite."
- **Easier:** `drei` ships well-vetted helpers for `OrbitControls`, `Sky`, `Environment`, `useTexture` — agents can produce a working scene without re-inventing scene-graph patterns.
- **Harder:** 3D scenes are heavier than 2D ones — the preview URL's first paint includes Three.js (~600 KB minified). Acceptable; the preview URL is for development, not production-grade Lighthouse scores.
- **Harder:** debugging 3D scene-graph issues (camera, lighting, depth buffer) has a steeper learning curve than 2D sprite debugging. Mitigated by `drei`'s `<Perf>` and `<Stats>` helpers; user-test feedback in STORY-18 will tell us whether non-technical pairs hit this.
- **Now true:** the workspace lists `templates/react-threejs-scene` rather than `templates/react-phaser-game`. `.claude/project.json` and `pnpm-workspace.yaml` already reflect this (set up in STORY-01). The roadmap (`roadmap/roadmap.yml`) was authored with this template name.

## Alternatives considered

- **React + Phaser (original plan).** Rejected for the texture-vs-sprite reason above. Strong fit for purely 2D games but not the best amplifier of the image-gen MCP we're committing to.
- **Plain React + Canvas API.** No scene graph; users would re-invent rendering primitives. Rejected as a learning surface — the template should reward the user, not test their fortitude.
- **Babylon.js.** Capable, with a more "game-engine" feel than Three.js. Rejected: heavier bundle (~1.6 MB vs Three.js ~600 KB), less React idiom alignment (no equivalent of `@react-three/fiber`).
- **PixiJS (2D, GPU-accelerated).** Better than Phaser for texture-heavy 2D but still 2D. Same image-gen-output rationale as Phaser.

Supersedes the template selection in `docs/executive_summary.md` §"POC phase" and `docs/project_plan.md` §11. The template's *purpose* (visually rewarding, exercises image-gen MCP, no backend required) is unchanged.
