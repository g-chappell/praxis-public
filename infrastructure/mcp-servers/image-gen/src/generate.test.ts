import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateImage, resolveSavePath, sizeFor, slugify, type ImagesClient } from './generate.js';

describe('slugify', () => {
  it('produces a filesystem-safe slug, truncated, falling back to "texture"', () => {
    expect(slugify('Seamless Mossy Stone!! texture')).toBe('seamless-mossy-stone-texture');
    expect(slugify('   ')).toBe('texture');
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(48);
  });
});

describe('sizeFor', () => {
  it('maps requested pixels to a supported size', () => {
    expect(sizeFor()).toBe('1024x1024');
    expect(sizeFor(512, 512)).toBe('1024x1024');
    expect(sizeFor(1600, 900)).toBe('1536x1024'); // landscape
    expect(sizeFor(900, 1600)).toBe('1024x1536'); // portrait
  });
});

describe('resolveSavePath', () => {
  const root = '/workspace';
  const tex = '/workspace/public/textures';

  it('defaults to <texturesDir>/<slug>.png', () => {
    expect(resolveSavePath(undefined, 'red brick', tex, root)).toBe(
      '/workspace/public/textures/red-brick.png',
    );
  });

  it('resolves an explicit relative path against the workspace root', () => {
    expect(resolveSavePath('public/textures/x.png', 'p', tex, root)).toBe(
      '/workspace/public/textures/x.png',
    );
  });

  it('rejects a path that escapes the workspace (traversal guard)', () => {
    expect(() => resolveSavePath('../../etc/passwd', 'p', tex, root)).toThrow(/escapes/);
    expect(() => resolveSavePath('/etc/passwd', 'p', tex, root)).toThrow(/escapes/);
  });
});

describe('generateImage', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mcp-imggen-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('writes the decoded PNG to the default textures path and returns it', async () => {
    const client: ImagesClient = {
      images: { generate: vi.fn().mockResolvedValue({ data: [{ b64_json: PNG_B64 }] }) },
    };
    const out = await generateImage(
      { prompt: 'mossy stone' },
      {
        client,
        texturesDir: join(dir, 'public/textures'),
        workspaceRoot: dir,
        model: 'gpt-image-1',
      },
    );
    expect(out).toBe(join(dir, 'public/textures/mossy-stone.png'));
    const bytes = await readFile(out);
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ); // PNG magic
    expect((client.images.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'mossy stone',
      size: '1024x1024',
    });
  });

  it('downloads a URL-form response via the injected fetch', async () => {
    const client: ImagesClient = {
      images: { generate: vi.fn().mockResolvedValue({ data: [{ url: 'https://img/x.png' }] }) },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from(PNG_B64, 'base64') });
    const out = await generateImage(
      { prompt: 'brick', save_path: 'public/textures/brick.png' },
      { client, texturesDir: dir, workspaceRoot: dir, model: 'dall-e-3', fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledWith('https://img/x.png');
    expect(await readFile(out)).toHaveLength(Buffer.from(PNG_B64, 'base64').length);
  });

  it('rejects an empty prompt and a no-data response', async () => {
    const empty: ImagesClient = { images: { generate: vi.fn().mockResolvedValue({ data: [] }) } };
    await expect(
      generateImage(
        { prompt: '' },
        { client: empty, texturesDir: dir, workspaceRoot: dir, model: 'm' },
      ),
    ).rejects.toThrow(/prompt is required/);
    await expect(
      generateImage(
        { prompt: 'x' },
        { client: empty, texturesDir: dir, workspaceRoot: dir, model: 'm' },
      ),
    ).rejects.toThrow(/no data/);
  });
});
