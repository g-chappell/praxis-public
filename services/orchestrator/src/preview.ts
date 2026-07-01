// Preview routing (STORY-13). Caddy can't be mutated dynamically (shared,
// multi-tenant host service), so a single static wildcard block
// `*.preview.<domain>` reverse-proxies ALL preview traffic to the orchestrator
// (:4001), and this module does the dynamic part:
//   - a slug→sandbox registry (slug = projectId),
//   - the Caddy on_demand_tls `ask` verdict (issue a cert only for live previews),
//   - an HTTP reverse proxy to the sandbox's dev server.
// See ADR-0015.

export interface PreviewTarget {
  /** Sandbox container IP on praxis-net (reachable from the orchestrator). */
  ip: string;
  port: number;
  /** The exact container this preview belongs to. Bound at registration so the
   *  proxy can re-resolve the live IP per request and refuse to serve once that
   *  container is gone — container IDs are unique and never reused by Docker, so
   *  this is the project-identity guarantee against IP reuse (STORY-51). */
  containerId: string;
}

const registry = new Map<string, PreviewTarget>();

/** Resolve a registered target's CURRENT IP (or null if its container is gone or
 *  stopped). Injected at boot from the Bun side (docker-backed); the default
 *  trusts the stored IP so the Node test path needs no Docker. */
export type PreviewIpResolver = (target: PreviewTarget) => Promise<string | null>;
let resolveLiveIp: PreviewIpResolver = async (t) => t.ip;
export function setPreviewIpResolver(fn: PreviewIpResolver): void {
  resolveLiveIp = fn;
}

/** Short-lived per-slug cache of the resolved IP, so a burst of preview requests
 *  (assets, HMR polls) doesn't inspect Docker on every hit. */
const RESOLVE_TTL_MS = 5_000;
const ipCache = new Map<string, { ip: string | null; expiry: number }>();

export function registerPreview(slug: string, target: PreviewTarget): void {
  registry.set(slug, target);
  ipCache.delete(slug); // a fresh container → drop any stale resolved IP
}

export function removePreview(slug: string): void {
  registry.delete(slug);
  ipCache.delete(slug);
}

export function getPreview(slug: string): PreviewTarget | undefined {
  return registry.get(slug);
}

/** Resolve a slug to a serveable target, re-checking that the bound container is
 *  still live and reading its current IP (TTL-cached). Returns null when the slug
 *  isn't registered OR its container is gone/stopped — so a stale registry entry
 *  whose IP Docker has since handed to another project is NEVER served (STORY-51).
 */
export async function resolvePreviewTarget(
  slug: string,
  now: number = Date.now(),
): Promise<PreviewTarget | null> {
  const target = registry.get(slug);
  if (!target) return null;
  const cached = ipCache.get(slug);
  let ip: string | null;
  if (cached && cached.expiry > now) {
    ip = cached.ip;
  } else {
    ip = await resolveLiveIp(target);
    ipCache.set(slug, { ip, expiry: now + RESOLVE_TTL_MS });
  }
  if (!ip) return null;
  return { ...target, ip };
}

/** The preview zone. Defaults to the prod domain so previews work without extra
 *  env plumbing on the VPS; dev/tests override via PREVIEW_DOMAIN. Must match the
 *  Caddy `*.preview.<domain>` block + the wildcard DNS record. */
export function previewDomain(): string {
  return process.env.PREVIEW_DOMAIN ?? 'preview.praxis.blacksail.dev';
}

/** Public preview URL for a slug. */
export function previewUrlFor(slug: string): string {
  return `https://${slug}.${previewDomain()}`;
}

/** Extract the slug (single subdomain label) from a `<slug>.preview.<domain>`
 *  Host, or null when the host isn't a preview host. Strips any `:port`. */
export function slugForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(':', 1)[0]!.toLowerCase();
  const suffix = `.${previewDomain().toLowerCase()}`;
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  if (!slug || slug.includes('.')) return null; // exactly one label
  return slug;
}

/** Caddy on_demand_tls ask verdict: true iff `domain` maps to a live preview. */
export function caddyAsk(domain: string | null | undefined): boolean {
  const slug = slugForHost(domain);
  return slug !== null && registry.has(slug);
}

/** If this is a preview-host WebSocket upgrade, return the slug; else null
 *  (STORY-30). Vite's HMR client connects to `wss://<slug>.preview.<domain>` — we
 *  tunnel that upgrade to the sandbox dev server; plain HTTP previews still go
 *  through proxyToSandbox. Node-safe (no Bun) so it stays unit-testable. */
export function previewWsSlug(
  host: string | null | undefined,
  upgradeHeader: string | null | undefined,
): string | null {
  if ((upgradeHeader ?? '').toLowerCase() !== 'websocket') return null;
  return slugForHost(host);
}

/** The upstream `ws://` URL for a preview WS upgrade — the sandbox dev server,
 *  preserving the request path + query (Vite's HMR endpoint). */
export function upstreamWsUrl(target: PreviewTarget, req: Request): string {
  const url = new URL(req.url);
  return `ws://${target.ip}:${target.port}${url.pathname}${url.search}`;
}

const HOP_BY_HOP = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade'];

/** Reverse-proxy a preview HTTP request to the sandbox dev server. (Vite HMR's
 *  WebSocket isn't proxied here — the app renders over plain HTTP; HMR is a
 *  follow-up.) Returns 502 when the upstream isn't answering yet (dev server
 *  still starting). */
export async function proxyToSandbox(req: Request, target: PreviewTarget): Promise<Response> {
  const url = new URL(req.url);
  const upstream = `http://${target.ip}:${target.port}${url.pathname}${url.search}`;
  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  try {
    return await fetch(upstream, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      // Bun/undici need this to stream a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    return new Response('preview starting…', {
      status: 502,
      headers: { 'content-type': 'text/plain', 'retry-after': '2' },
    });
  }
}
