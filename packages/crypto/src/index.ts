import { createRequire } from 'node:module';

// libsodium-wrappers@0.7.x ships a broken ESM build (its .mjs imports a
// sibling ./libsodium.mjs that pnpm places in a different package), so we
// load the working CommonJS build through createRequire. Resolution is
// relative to this file, hitting packages/crypto/node_modules.
const require = createRequire(import.meta.url);
const _sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers');

// Authenticated symmetric encryption for OAuth tokens at rest.
// XSalsa20-Poly1305 (libsodium secretbox): a 24-byte random nonce is
// prepended to the ciphertext, the whole blob base64-encoded. The
// Poly1305 tag makes tampering detectable — decrypt() throws rather
// than returning corrupted plaintext.
//
// Key material comes from PRAXIS_MASTER_KEY (base64, 32 bytes decoded).
// The key is resolved lazily on first use so importing this module
// during Next.js's build-time page-data collection never throws.

type Sodium = typeof _sodium;

let _ready: Promise<Sodium> | undefined;

async function getSodium(): Promise<Sodium> {
  if (!_ready) {
    _ready = _sodium.ready.then(() => _sodium);
  }
  return _ready;
}

let _key: Uint8Array | undefined;

function getKey(sodium: Sodium): Uint8Array {
  if (_key) {
    return _key;
  }
  const raw = process.env.PRAXIS_MASTER_KEY;
  if (!raw) {
    throw new Error('PRAXIS_MASTER_KEY is not set');
  }
  let decoded: Uint8Array;
  try {
    decoded = sodium.from_base64(raw, sodium.base64_variants.ORIGINAL);
  } catch {
    throw new Error('PRAXIS_MASTER_KEY is not valid base64');
  }
  if (decoded.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `PRAXIS_MASTER_KEY must decode to ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${decoded.length}`,
    );
  }
  _key = decoded;
  return _key;
}

/** Encrypt a UTF-8 string. Returns base64(nonce || ciphertext+tag). */
export async function encrypt(plaintext: string): Promise<string> {
  const sodium = await getSodium();
  const key = getKey(sodium);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);
  const blob = new Uint8Array(nonce.length + cipher.length);
  blob.set(nonce, 0);
  blob.set(cipher, nonce.length);
  return sodium.to_base64(blob, sodium.base64_variants.ORIGINAL);
}

/** Decrypt a value produced by {@link encrypt}. Throws on tampering or wrong key. */
export async function decrypt(token: string): Promise<string> {
  const sodium = await getSodium();
  const key = getKey(sodium);
  let blob: Uint8Array;
  try {
    blob = sodium.from_base64(token, sodium.base64_variants.ORIGINAL);
  } catch {
    throw new Error('ciphertext is not valid base64');
  }
  const nonceBytes = sodium.crypto_secretbox_NONCEBYTES;
  if (blob.length <= nonceBytes) {
    throw new Error('ciphertext is too short');
  }
  const nonce = blob.subarray(0, nonceBytes);
  const cipher = blob.subarray(nonceBytes);
  const plain = sodium.crypto_secretbox_open_easy(cipher, nonce, key);
  return sodium.to_string(plain);
}

/** Reset cached key — for tests that swap PRAXIS_MASTER_KEY between cases. */
export function _resetKeyCacheForTests(): void {
  _key = undefined;
}
