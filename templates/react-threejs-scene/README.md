# React + Three.js scene

A 3D scene starter — Vite + React + TypeScript + [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber)
and [drei](https://github.com/pmndrs/drei). It renders a rotating cube you can
extend with the agent.

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # type-check + production build
```

Edit `src/App.tsx` to change the scene. See `AGENTS.md` for conventions the agent
follows (R3F patterns, textures via the image-gen MCP server, GLTF loading).
