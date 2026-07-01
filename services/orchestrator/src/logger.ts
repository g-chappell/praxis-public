// Pino logger + Hono request-logging middleware.
//
// Production: line-delimited JSON to stdout (parsed by journald, fed
// into Loki/grafana later). Development: pino-pretty for human reading.
//
// One log line per HTTP request. WebSocket logging is more selective —
// see src/routes/ws.ts.

import { createMiddleware } from 'hono/factory';
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }
    : {}),
});

/** Hono middleware: logs one structured line per request with method,
 *  path, status, and duration. */
export const httpLogger = createMiddleware(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    },
    'request',
  );
});
