import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemoryObjectStore, MinioObjectStore } from './object-store.js';

describe('InMemoryObjectStore', () => {
  it('round-trips a snapshot', async () => {
    const store = new InMemoryObjectStore();
    expect(await store.hasSnapshot('p1')).toBe(false);
    expect(await store.getSnapshot('p1')).toBeNull();

    await store.putSnapshot('p1', Readable.from(Buffer.from('tarball-bytes')));
    expect(await store.hasSnapshot('p1')).toBe(true);

    const back = await store.getSnapshot('p1');
    const chunks: Buffer[] = [];
    for await (const c of back!) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('tarball-bytes');
  });
});

describe('MinioObjectStore.fromEnv', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns null when MINIO_* is unconfigured', () => {
    expect(MinioObjectStore.fromEnv()).toBeNull();
  });

  it('builds a store when MINIO_* is set', () => {
    process.env.MINIO_ENDPOINT = 'minio.local';
    process.env.MINIO_ACCESS_KEY = 'ak';
    process.env.MINIO_SECRET_KEY = 'sk';
    expect(MinioObjectStore.fromEnv()).toBeInstanceOf(MinioObjectStore);
  });
});
