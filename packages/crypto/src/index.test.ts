import { createRequire } from 'node:module';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { _resetKeyCacheForTests, decrypt, encrypt } from './index';

const require = createRequire(import.meta.url);
const _sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');

let validKey: string;

beforeAll(async () => {
  await _sodium.ready;
  // A real 32-byte key, base64-encoded the way PRAXIS_MASTER_KEY is provisioned.
  validKey = _sodium.to_base64(
    _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES),
    _sodium.base64_variants.ORIGINAL,
  );
});

beforeEach(() => {
  _resetKeyCacheForTests();
  process.env.PRAXIS_MASTER_KEY = validKey;
});

afterEach(() => {
  delete process.env.PRAXIS_MASTER_KEY;
});

describe('@praxis/crypto', () => {
  it('round-trips a token through encrypt → decrypt', async () => {
    const secret = 'sk-ant-oat01-some-access-token-value';
    const cipher = await encrypt(secret);
    expect(cipher).not.toContain(secret);
    expect(await decrypt(cipher)).toBe(secret);
  });

  it('round-trips unicode and empty strings', async () => {
    for (const value of ['', 'café ☕ — über', '🔐🔐🔐']) {
      expect(await decrypt(await encrypt(value))).toBe(value);
    }
  });

  it('produces a different ciphertext each time (random nonce)', async () => {
    const a = await encrypt('same-plaintext');
    const b = await encrypt('same-plaintext');
    expect(a).not.toBe(b);
    expect(await decrypt(a)).toBe('same-plaintext');
    expect(await decrypt(b)).toBe('same-plaintext');
  });

  it('rejects a tampered ciphertext', async () => {
    const cipher = await encrypt('do-not-tamper');
    const bytes = _sodium.from_base64(cipher, _sodium.base64_variants.ORIGINAL);
    const last = bytes.length - 1;
    bytes.set([bytes[last]! ^ 0x01], last);
    const tampered = _sodium.to_base64(bytes, _sodium.base64_variants.ORIGINAL);
    await expect(decrypt(tampered)).rejects.toThrow();
  });

  it('rejects decryption under a different key', async () => {
    const cipher = await encrypt('cross-key');
    _resetKeyCacheForTests();
    process.env.PRAXIS_MASTER_KEY = _sodium.to_base64(
      _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES),
      _sodium.base64_variants.ORIGINAL,
    );
    await expect(decrypt(cipher)).rejects.toThrow();
  });

  it('throws when PRAXIS_MASTER_KEY is missing', async () => {
    delete process.env.PRAXIS_MASTER_KEY;
    await expect(encrypt('x')).rejects.toThrow(/PRAXIS_MASTER_KEY is not set/);
  });

  it('throws when PRAXIS_MASTER_KEY is the wrong length', async () => {
    process.env.PRAXIS_MASTER_KEY = _sodium.to_base64(
      _sodium.randombytes_buf(16),
      _sodium.base64_variants.ORIGINAL,
    );
    await expect(encrypt('x')).rejects.toThrow(/must decode to 32 bytes/);
  });

  it('rejects a too-short ciphertext blob', async () => {
    const tiny = _sodium.to_base64(new Uint8Array(4), _sodium.base64_variants.ORIGINAL);
    await expect(decrypt(tiny)).rejects.toThrow(/too short/);
  });
});
