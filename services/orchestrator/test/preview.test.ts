import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getPreview,
  previewUrlFor,
  previewWsSlug,
  registerPreview,
  removePreview,
  resolvePreviewTarget,
  setPreviewIpResolver,
  slugForHost,
  upstreamWsUrl,
} from '../src/preview';

const OLD_DOMAIN = process.env.PREVIEW_DOMAIN;
const OLD_SCHEME = process.env.PREVIEW_SCHEME;
const OLD_PORT = process.env.PREVIEW_PORT;
beforeEach(() => {
  process.env.PREVIEW_DOMAIN = 'preview.example.dev';
  process.env.PREVIEW_SCHEME = 'http';
  process.env.PREVIEW_PORT = '4001';
});
afterEach(() => {
  process.env.PREVIEW_DOMAIN = OLD_DOMAIN;
  process.env.PREVIEW_SCHEME = OLD_SCHEME;
  process.env.PREVIEW_PORT = OLD_PORT;
  removePreview('p1');
  setPreviewIpResolver(async (t) => t.ip); // restore the default resolver
});

describe('slugForHost', () => {
  it('extracts the single subdomain label (ignoring any port)', () => {
    expect(slugForHost('abc123.preview.example.dev')).toBe('abc123');
    expect(slugForHost('abc123.preview.example.dev:443')).toBe('abc123');
    expect(slugForHost('ABC123.PREVIEW.EXAMPLE.DEV')).toBe('abc123');
  });

  it('rejects non-preview, multi-label, bare-domain and empty hosts', () => {
    expect(slugForHost('api.praxis.example.dev')).toBeNull();
    expect(slugForHost('a.b.preview.example.dev')).toBeNull(); // more than one label
    expect(slugForHost('preview.example.dev')).toBeNull(); // no slug
    expect(slugForHost('')).toBeNull();
    expect(slugForHost(undefined)).toBeNull();
  });
});

describe('registry + previewUrlFor', () => {
  it('register/get/remove tracks live previews', () => {
    expect(getPreview('p1')).toBeUndefined();
    registerPreview('p1', { ip: '172.20.0.5', port: 5173, containerId: 'c1' });
    expect(getPreview('p1')).toEqual({ ip: '172.20.0.5', port: 5173, containerId: 'c1' });
    removePreview('p1');
    expect(getPreview('p1')).toBeUndefined();
  });

  it('builds a scheme + port-qualified public URL', () => {
    expect(previewUrlFor('p1')).toBe('http://p1.preview.example.dev:4001');
  });
});

describe('resolvePreviewTarget (STORY-51 cross-project isolation)', () => {
  it('returns null for an unregistered slug', async () => {
    expect(await resolvePreviewTarget('p1')).toBeNull();
  });

  it('re-resolves the live IP from the bound container', async () => {
    registerPreview('p1', { ip: '172.20.0.5', port: 5173, containerId: 'c1' });
    setPreviewIpResolver(async (t) => (t.containerId === 'c1' ? '172.20.0.9' : null));
    expect(await resolvePreviewTarget('p1')).toEqual({
      ip: '172.20.0.9', // current IP, not the stale registered 172.20.0.5
      port: 5173,
      containerId: 'c1',
    });
  });

  it('refuses to serve when the bound container is gone (no reused IP)', async () => {
    registerPreview('p1', { ip: '172.20.0.5', port: 5173, containerId: 'c1' });
    setPreviewIpResolver(async () => null); // container removed → resolver returns null
    expect(await resolvePreviewTarget('p1')).toBeNull();
  });

  it('caches the resolved IP within the TTL (one resolve per burst)', async () => {
    registerPreview('p1', { ip: '172.20.0.5', port: 5173, containerId: 'c1' });
    let calls = 0;
    setPreviewIpResolver(async () => {
      calls += 1;
      return '172.20.0.9';
    });
    const now = 1_000;
    await resolvePreviewTarget('p1', now);
    await resolvePreviewTarget('p1', now + 1_000); // within 5s TTL → cache hit
    expect(calls).toBe(1);
    await resolvePreviewTarget('p1', now + 6_000); // past TTL → re-resolve
    expect(calls).toBe(2);
  });

  it('drops the cache on re-register so a new container is re-resolved', async () => {
    registerPreview('p1', { ip: '172.20.0.5', port: 5173, containerId: 'c1' });
    let last = '172.20.0.9';
    setPreviewIpResolver(async () => last);
    const now = 1_000;
    expect((await resolvePreviewTarget('p1', now))?.ip).toBe('172.20.0.9');
    last = '172.20.0.11';
    registerPreview('p1', { ip: '172.20.0.11', port: 5173, containerId: 'c2' }); // invalidates cache
    expect((await resolvePreviewTarget('p1', now))?.ip).toBe('172.20.0.11');
  });
});

describe('preview HMR WebSocket tunnel (STORY-30)', () => {
  it('previewWsSlug returns the slug only for a preview-host WS upgrade', () => {
    expect(previewWsSlug('p1.preview.example.dev', 'websocket')).toBe('p1');
    expect(previewWsSlug('p1.preview.example.dev', 'WebSocket')).toBe('p1'); // case-insensitive
    expect(previewWsSlug('p1.preview.example.dev', null)).toBeNull(); // not an upgrade
    expect(previewWsSlug('p1.preview.example.dev', 'h2c')).toBeNull(); // other upgrade
    expect(previewWsSlug('api.praxis.example.dev', 'websocket')).toBeNull(); // not a preview host
  });

  it('upstreamWsUrl targets the sandbox dev server, preserving path + query', () => {
    const target = { ip: '172.20.0.5', port: 5173, containerId: 'c1' };
    expect(upstreamWsUrl(target, new Request('https://p1.preview.example.dev/'))).toBe(
      'ws://172.20.0.5:5173/',
    );
    expect(
      upstreamWsUrl(target, new Request('https://p1.preview.example.dev/@vite/client?token=x')),
    ).toBe('ws://172.20.0.5:5173/@vite/client?token=x');
  });
});
