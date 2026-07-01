// Praxis orchestrator entrypoint. Bun-only runtime.
//
// Loads the HTTP app + mounts the WebSocket route (which requires Bun
// globals). For in-process testing under Node, import { app } from
// './app' instead — keeps tests Node-compatible.

import type { ServerWebSocket } from 'bun';

import { app } from './app';
import { logger } from './logger';
import { setPreviewIpResolver } from './preview';
import { getSandbox } from './runtime';
import { reconcileSessionsOnBoot, startIdleSweep } from './sandbox-sweep';
import { isPreviewSocket, previewWebsocket, tryPreviewUpgrade } from './routes/preview-ws';
import { websocket, wsRoute } from './routes/ws';
import { VERSION } from './version';

app.route('/ws', wsRoute);

// Resolve a preview's live container IP from Docker per request (STORY-51).
// exposePort inspects by the bound containerId — if the container is gone or
// stopped it throws, so we return null and the proxy refuses to serve a reused
// IP. Container IDs are unique and never reused, so this is the identity check.
setPreviewIpResolver(async (target) => {
  try {
    const addr = await getSandbox().exposePort(
      { projectId: '', containerId: target.containerId },
      target.port,
    );
    return new URL(addr).hostname || null;
  } catch {
    return null;
  }
});

// Roadmap text said :4000 but the autodev-mcp dashboard owns :4000
// on this VPS. See ADR-0004 port-allocation note.
const PORT = Number(process.env.PORT ?? 4001);

// The Hono session-socket handler, viewed structurally so we can dispatch the one
// Bun `websocket` handler across two data shapes (Hono's + the preview tunnel's).
const sessionWs = websocket as unknown as {
  open?: (ws: ServerWebSocket<unknown>) => void;
  message?: (ws: ServerWebSocket<unknown>, msg: string | Uint8Array) => void;
  close?: (ws: ServerWebSocket<unknown>, code: number, reason: string) => void;
  drain?: (ws: ServerWebSocket<unknown>) => void;
};

// One Bun `websocket` handler serves every socket; dispatch preview HMR tunnels
// (STORY-30) to their relay and everything else to the Hono session socket.
const combinedWebsocket = {
  open(ws: ServerWebSocket<unknown>) {
    if (isPreviewSocket(ws)) previewWebsocket.open(ws);
    else sessionWs.open?.(ws);
  },
  message(ws: ServerWebSocket<unknown>, msg: string | Uint8Array) {
    if (isPreviewSocket(ws)) previewWebsocket.message(ws, msg);
    else sessionWs.message?.(ws, msg);
  },
  close(ws: ServerWebSocket<unknown>, code: number, reason: string) {
    if (isPreviewSocket(ws)) previewWebsocket.close(ws);
    else sessionWs.close?.(ws, code, reason);
  },
  drain(ws: ServerWebSocket<unknown>) {
    if (!isPreviewSocket(ws)) sessionWs.drain?.(ws);
  },
};

export default {
  async fetch(
    req: Request,
    server: {
      upgrade(req: Request, options: { data: unknown; headers?: Record<string, string> }): boolean;
    },
  ) {
    // Tunnel Vite HMR WebSocket upgrades on a preview host to the sandbox dev
    // server (STORY-30). Non-preview / non-upgrade requests fall through to the
    // Hono app (HTTP previews, the /ws session socket, the API).
    const upgrade = await tryPreviewUpgrade(req, server);
    if (upgrade === 'upgraded') return undefined;
    if (upgrade === 'failed') {
      return new Response('preview starting…', {
        status: 502,
        headers: { 'content-type': 'text/plain', 'retry-after': '2' },
      });
    }
    return app.fetch(req, server);
  },
  port: PORT,
  websocket: combinedWebsocket,
};

if (import.meta.main) {
  logger.info({ port: PORT, version: VERSION }, 'orchestrator.boot');
  void reconcileSessionsOnBoot(); // mark prior-process sessions ended (STORY-51)
  startIdleSweep();
}
