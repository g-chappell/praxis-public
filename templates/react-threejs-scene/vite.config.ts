import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In a Praxis sandbox the preview is served at https://<slug>.preview.<domain>
// (Caddy terminates TLS on 443 → orchestrator → this dev server). `allowedHosts:
// true` accepts the dynamic per-project preview host — the dev server is only
// reachable via the authenticated proxy on the internal praxis-net.
//
// Preview updates are gated to AGENT-TURN-COMPLETION by the workspace (it reloads
// the preview iframe once the agent finishes, and only if files changed), so
// Vite's own auto-reload is OFF in the sandbox — the preview holds steady while
// the agent works (incl. its /workspace/.praxis-agent store churn) instead of
// flashing on every write. Set PRAXIS_LOCAL=1 to run the template standalone with
// normal localhost HMR.
const local = process.env.PRAXIS_LOCAL === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    ...(local ? {} : { allowedHosts: true, hmr: false }),
  },
});
