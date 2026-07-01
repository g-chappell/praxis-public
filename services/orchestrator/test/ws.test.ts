// WebSocket integration test — Bun-only. Skips under Vitest+Node.
//
// CI's required `ci` job runs Vitest under Node, so this test is a
// no-op there. Running locally with `bun test test/ws.test.ts`
// exercises the real Bun.serve path against /ws.

import { describe, expect, test } from 'vitest';

const hasBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

describe.skipIf(!hasBun)('WebSocket /ws (Bun only)', () => {
  test('ping → pong within 1s', async () => {
    // Dynamic import keeps the Bun-only modules out of Node's module
    // graph entirely — `hono/bun` references Bun globals at import time.
    const { default: server } = await import('../src/index.js');
    const BunRef = (
      globalThis as { Bun: { serve: (cfg: unknown) => { port: number; stop: () => void } } }
    ).Bun;

    const live = BunRef.serve({ port: 0, fetch: server.fetch, websocket: server.websocket });
    try {
      const url = `ws://127.0.0.1:${live.port}/ws`;
      const ws = new WebSocket(url);

      const pong = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no pong in 1s')), 1000);
        ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'ping' })));
        ws.addEventListener('message', (evt) => {
          clearTimeout(timer);
          resolve(JSON.parse(String(evt.data)));
        });
        ws.addEventListener('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });

      expect(pong).toMatchObject({ type: 'pong' });
      expect((pong as { ts: number }).ts).toBeGreaterThan(0);

      ws.close();
    } finally {
      live.stop();
    }
  });
});
