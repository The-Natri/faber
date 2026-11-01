import crypto from 'crypto';

export interface KdfParams {
  algo: 'scrypt';
  N: number;
  r: number;
  p: number;
  keylen: number;
  // v2 salts are random bytes stored as hex; the interim build passed its hex salt string as UTF-8
  saltEncoding: 'hex' | 'utf8';
  legacy?: boolean;
}

export const CURRENT_KDF: KdfParams = { algo: 'scrypt', N: 32768, r: 8, p: 1, keylen: 64, saltEncoding: 'hex' };

function scrypt(secret: string, salt: Buffer, keylen: number, params: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, keylen, { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

const saltBytes = (salt: string, params: KdfParams) =>
  params.saltEncoding === 'utf8' ? Buffer.from(salt, 'utf8') : Buffer.from(salt, 'hex');

export async function hashSecret(secret: string, params: KdfParams = CURRENT_KDF): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(secret, saltBytes(salt, params), params.keylen, params);
  return { hash: key.toString('hex'), salt };
}

export async function verifySecret(secret: string, hash: string, salt: string, params: KdfParams): Promise<boolean> {
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(secret, saltBytes(salt, params), params.keylen, params);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ---- Recovery codes: 16 base32 characters (80 bits) shown as XXXX-XXXX-XXXX-XXXX ----

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateRecoveryCode(): string {
  const bytes = crypto.randomBytes(10);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

// Case, spaces and dashes don't matter; digits that look like letters (0, 1, 8) map to them
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
}

// The interim build's hex keys: only case and separators were ignored
export function normalizeLegacyRecoveryKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

// ---- Vault data key wrapping ----
// blob = version(1) | log2(N)(1) | r(1) | p(1) | kek salt(16) | iv(12) | auth tag(16) | wrapped key(32)
// The KDF cost travels with the blob, so raising CURRENT_KDF later never strands an existing key.

const WRAP_VERSION = 1;
const HEADER = 4;

export function generateDataKey(): Buffer {
  return crypto.randomBytes(32);
}

export async function wrapKey(dataKey: Buffer, secret: string, params: KdfParams = CURRENT_KDF): Promise<Buffer> {
  const kekParams: KdfParams = { ...params, keylen: 32, saltEncoding: 'hex' };
  const salt = crypto.randomBytes(16);
  const kek = await scrypt(secret, salt, 32, kekParams);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  kek.fill(0);
  const header = Buffer.from([WRAP_VERSION, Math.log2(params.N), params.r, params.p]);
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), wrapped]);
}

// Throws if the secret is wrong or the blob was tampered with
export async function unwrapKey(blob: Buffer, secret: string): Promise<Buffer> {
  if (blob[0] !== WRAP_VERSION) throw new Error(`Unknown key wrap version ${blob[0]}`);
  const kekParams: KdfParams = { algo: 'scrypt', N: 2 ** blob[1], r: blob[2], p: blob[3], keylen: 32, saltEncoding: 'hex' };
  const salt = blob.subarray(HEADER, HEADER + 16);
  const iv = blob.subarray(HEADER + 16, HEADER + 28);
  const tag = blob.subarray(HEADER + 28, HEADER + 44);
  const wrapped = blob.subarray(HEADER + 44);
  const kek = await scrypt(secret, salt, 32, kekParams);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  } finally {
    kek.fill(0);
  }
}

// ---- Lockout: every 5th consecutive failure locks for 30 s, doubling each time, capped at 15 min ----

export const ATTEMPTS_PER_LOCK = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

export function lockDurationMs(failedAttempts: number): number {
  if (failedAttempts < ATTEMPTS_PER_LOCK || failedAttempts % ATTEMPTS_PER_LOCK !== 0) return 0;
  const lockNumber = failedAttempts / ATTEMPTS_PER_LOCK;
  return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (lockNumber - 1));
}
