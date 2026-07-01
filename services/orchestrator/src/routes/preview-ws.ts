// Preview HMR WebSocket tunnel (STORY-30). The HTTP preview proxy (preview.ts)
// can't carry a WebSocket upgrade, so Vite's HMR socket never connected through
// `<slug>.preview.<domain>` and the preview only updated on a manual refresh.
//
// This tunnels a preview-host WS upgrade to the sandbox dev server: we accept the
// browser's upgrade with a RAW Bun `server.upgrade` (so we can echo the `vite-hmr`
// subprotocol), open a client WebSocket to the sandbox, and relay frames both
// ways. Bun-coupled — wired in index.ts, never imported by the Node test path.
// (Opening an outbound socket is fine under Bun; the dockerode 501 rule — ADR-0010
// — is about hijacked docker streams, not plain network sockets.)

import type { ServerWebSocket } from 'bun';

import { logger } from '../logger';
import { previewWsSlug, resolvePreviewTarget, upstreamWsUrl } from '../preview';

/** Just the slice of Bun's Server we use — sidesteps the Server<T> generic. */
interface UpgradableServer {
  upgrade(req: Request, options: { data: unknown; headers?: Record<string, string> }): boolean;
}

interface PreviewWsData {
  kind: 'preview';
  upstreamUrl: string;
  /** Subprotocol the browser offered (e.g. 'vite-hmr'); offered upstream too. */
  protocol: string | null;
  /** The client socket to the sandbox dev server, set on open. */
  up: WebSocket | null;
  /** Browser→sandbox frames buffered until the upstream socket opens. */
  buffer: (string | Uint8Array)[];
}

/** True for sockets this module owns — lets index.ts dispatch the shared Bun
 *  `websocket` handler between preview tunnels and the Hono session socket. */
export function isPreviewSocket(ws: ServerWebSocket<unknown>): boolean {
  return (ws.data as { kind?: string } | undefined)?.kind === 'preview';
}

export type PreviewUpgrade = 'upgraded' | 'failed' | 'pass';

/** If `req` is a preview-host WS upgrade, accept it and return 'upgraded' (Bun
 *  completes the 101 handshake; frames then flow through previewWebsocket).
 *  Returns 'failed' when the preview isn't live (caller answers 502), or 'pass'
 *  for any non-preview / non-upgrade request (caller falls through to the app). */
export async function tryPreviewUpgrade(
  req: Request,
  server: UpgradableServer,
): Promise<PreviewUpgrade> {
  const slug = previewWsSlug(req.headers.get('host'), req.headers.get('upgrade'));
  if (slug === null) return 'pass';
  // Re-resolve the bound container's live IP (STORY-51) — a stale entry whose
  // container is gone returns null and we refuse the tunnel rather than relaying
  // HMR into a reused IP that may now be another project's dev server.
  const target = await resolvePreviewTarget(slug);
  if (!target) return 'failed';

  const protocol = req.headers.get('sec-websocket-protocol');
  const data: PreviewWsData = {
    kind: 'preview',
    upstreamUrl: upstreamWsUrl(target, req),
    protocol,
    up: null,
    buffer: [],
  };
  // Echo the client's first offered subprotocol so the HMR handshake completes.
  const headers = protocol
    ? { 'Sec-WebSocket-Protocol': protocol.split(',')[0]!.trim() }
    : undefined;
  const ok = server.upgrade(req, headers ? { data, headers } : { data });
  return ok ? 'upgraded' : 'failed';
}

/** Bun `websocket` handlers for preview tunnels. Dispatched from index.ts only
 *  when isPreviewSocket(ws). */
export const previewWebsocket = {
  open(ws: ServerWebSocket<unknown>): void {
    const data = ws.data as PreviewWsData;
    const protocols = data.protocol ? data.protocol.split(',').map((p) => p.trim()) : undefined;
    let up: WebSocket;
    try {
      up = new WebSocket(data.upstreamUrl, protocols);
    } catch (err) {
      logger.warn(
        { url: data.upstreamUrl, err: err instanceof Error ? err.message : String(err) },
        'preview_ws.upstream_open_failed',
      );
      ws.close();
      return;
    }
    data.up = up;
    up.binaryType = 'arraybuffer';
    up.onopen = () => {
      for (const f of data.buffer) up.send(f);
      data.buffer = [];
    };
    up.onmessage = (ev: MessageEvent) => {
      try {
        ws.send(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data as ArrayBuffer));
      } catch {
        /* browser socket already closing */
      }
    };
    up.onclose = () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    };
    up.onerror = () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    };
  },

  message(ws: ServerWebSocket<unknown>, msg: string | Uint8Array): void {
    const data = ws.data as PreviewWsData;
    if (data.up && data.up.readyState === WebSocket.OPEN) data.up.send(msg);
    else data.buffer.push(msg);
  },

  close(ws: ServerWebSocket<unknown>): void {
    const data = ws.data as PreviewWsData;
    try {
      data.up?.close();
    } catch {
      /* already closed */
    }
  },
};
