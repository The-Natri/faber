import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import { V1_SCHEMA } from '../../db/migrations/001_baseline.ts';
import { AuthService } from './index.ts';
import {
  generateDataKey, generateRecoveryCode, lockDurationMs, normalizeRecoveryCode, unwrapKey, wrapKey, type KdfParams,
} from './crypto.ts';

// Cheap parameters keep the suite fast; production uses CURRENT_KDF
const FAST: KdfParams = { algo: 'scrypt', N: 1024, r: 8, p: 1, keylen: 64, saltEncoding: 'hex' };
const CODE_FORMAT = /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/;

let dir: string;
let db: Database.Database;
let clock: Date;

const service = () => new AuthService(db, { kdf: FAST, now: () => clock });
interface AuthRowForTest {
  kdf_params: string;
  vault_key_by_password: Buffer;
  vault_key_by_recovery: Buffer;
  failed_attempts: number;
  locked_until: string | null;
  must_change_password: number;
}
const authRow = () => db.prepare('SELECT * FROM auth').get() as AuthRowForTest;
const keyByPassword = (password: string) => unwrapKey(authRow().vault_key_by_password, password);
const keyByRecovery = (code: string) => unwrapKey(authRow().vault_key_by_recovery, normalizeRecoveryCode(code));

async function freshDb() {
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
}

// A database exactly as the interim password-reset build left it
async function interimDb(username: string, password: string, recoveryKey: string) {
  db.exec(V1_SCHEMA);
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const interimHash = (secret: string) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}:${crypto.scryptSync(secret, salt, 64).toString('hex')}`;
  };
  const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  insert.run('username', username);
  insert.run('password_hash', interimHash(password));
  insert.run('recovery_key_hash', interimHash(recoveryKey.replace(/[^a-z0-9]/gi, '').toUpperCase()));
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-auth-'));
  db = new Database(path.join(dir, 'faber.db'));
  clock = new Date('2026-10-11T10:00:00Z');
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('auth crypto', () => {
  it('makes base32 recovery codes in four groups', () => {
    const codes = new Set(Array.from({ length: 50 }, generateRecoveryCode));
    for (const code of codes) expect(code).toMatch(CODE_FORMAT);
    expect(codes.size).toBe(50);
  });

  it('ignores case and separators and maps look-alike digits when normalizing', () => {
    expect(normalizeRecoveryCode('abcd-efgh ijkl-mn0p')).toBe('ABCDEFGHIJKLMNOP');
    expect(normalizeRecoveryCode('1B8O')).toBe('IBBO');
  });

  it('round-trips a wrapped key and rejects the wrong secret', async () => {
    const key = generateDataKey();
    const blob = await wrapKey(key, 'correct horse', FAST);
    expect((await unwrapKey(blob, 'correct horse')).equals(key)).toBe(true);
    await expect(unwrapKey(blob, 'wrong horse')).rejects.toThrow();
  });

  it('locks on every fifth failure for 30 s, doubling, capped at 15 min', () => {
    expect([1, 4, 6, 9].map(lockDurationMs)).toEqual([0, 0, 0, 0]);
    expect([5, 10, 15, 20].map(lockDurationMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(lockDurationMs(50)).toBe(15 * 60_000);
  });
});

describe('AuthService', () => {
  it('onboards once, then locks and signs in again', async () => {
    await freshDb();
    const auth = service();
    expect(auth.status()).toEqual({ state: 'onboarding' });

    const { recoveryCode } = await auth.onboard('owner', 'a long password');
    expect(recoveryCode).toMatch(CODE_FORMAT);
    expect(auth.status()).toEqual({ state: 'unlocked', username: 'owner' });
    await expect(auth.onboard('other', 'another password')).rejects.toMatchObject({ code: 'CONFLICT' });

    auth.lock();
    expect(auth.sessionState()).toBe('locked');
    expect(auth.hasVaultKey()).toBe(false);

    expect(await auth.login('owner', 'a long password')).toEqual({ mustChangePassword: false });
    expect(auth.sessionState()).toBe('unlocked');
  });

  it('counts failures, locks out after five, and unlocks once the wait passes', async () => {
    await freshDb();
    const auth = service();
    await auth.onboard('owner', 'a long password');
    auth.lock();

    for (let i = 1; i <= 4; i++) {
      await expect(auth.login('owner', 'nope')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS', message: expect.stringContaining(`${5 - i}`) });
    }
    await expect(auth.login('wrong-user', 'a long password')).rejects.toMatchObject({ code: 'LOCKED_OUT' });
    await expect(auth.login('owner', 'a long password')).rejects.toMatchObject({ code: 'LOCKED_OUT' });
    expect(auth.status()).toMatchObject({ state: 'locked', lockedUntil: '2026-10-11T10:00:30.000Z' });

    clock = new Date('2026-10-11T10:00:31Z');
    await auth.login('owner', 'a long password');
    expect(authRow()).toMatchObject({ failed_attempts: 0, locked_until: null });
  });

  it('forces a password change on the first v2 sign-in, then issues a base32 code and retires the hex key', async () => {
    const hexKey = 'A1B2-C3D4-E5F6-0789'; // gitleaks:allow (made-up test fixture)
    await interimDb('owner', 'yourchoice', hexKey);
    const auth = service();
    expect(JSON.parse(authRow().kdf_params).password.legacy).toBe(true);

    // Sign-in only verifies; nothing else is unlocked until the password changes
    expect(await auth.login('owner', 'yourchoice')).toEqual({ mustChangePassword: true });
    expect(auth.status()).toEqual({ state: 'mustChangePassword', username: 'owner' });
    expect(auth.hasVaultKey()).toBe(false);
    expect(authRow().must_change_password).toBe(1);

    // Quitting before the change still forces it next time
    auth.lock();
    expect(await service().login('owner', 'yourchoice')).toEqual({ mustChangePassword: true });
    // Until then the old hex key still works (it is the way back in if the password is lost)
    expect(JSON.parse(authRow().kdf_params).recovery.legacy).toBe(true);

    await expect(auth.changePassword('yourchoice', 'yourchoice')).rejects.toMatchObject({ code: 'CONFLICT' });
    const { recoveryCode } = await auth.changePassword('yourchoice', 'a proper passphrase');

    expect(recoveryCode).toMatch(CODE_FORMAT);
    expect(auth.sessionState()).toBe('unlocked');
    expect(auth.hasVaultKey()).toBe(true);
    const kdf = JSON.parse(authRow().kdf_params);
    expect(kdf.password.legacy).toBeUndefined();
    expect(kdf.recovery.legacy).toBeUndefined();
    expect(authRow().must_change_password).toBe(0);

    // Later sign-ins are normal and issue nothing
    auth.lock();
    expect(await auth.login('owner', 'a proper passphrase')).toEqual({ mustChangePassword: false });
    await expect(auth.login('owner', 'yourchoice')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' });

    // The old hex key no longer works; the new code does, and keeps the vault key
    auth.lock();
    const keyBefore = await keyByPassword('a proper passphrase');
    await expect(auth.recover(hexKey, 'brand new password')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' });
    await expect(auth.recover(recoveryCode!, 'brand new password')).resolves.toMatchObject({ username: 'owner' });
    expect((await keyByPassword('brand new password')).equals(keyBefore)).toBe(true);
  });

  it('still accepts the interim hex key for a reset before the first v2 sign-in', async () => {
    const hexKey = 'A1B2-C3D4-E5F6-0789'; // gitleaks:allow (made-up test fixture)
    await interimDb('owner', 'yourchoice', hexKey);
    const auth = service();

    const { recoveryCode } = await auth.recover('a1b2c3d4e5f60789', 'brand new password');

    expect(recoveryCode).toMatch(CODE_FORMAT);
    await auth.login('owner', 'brand new password');
    expect(auth.sessionState()).toBe('unlocked');
  });

  it('keeps the same vault key through change, reset and regenerate', async () => {
    await freshDb();
    const auth = service();
    const { recoveryCode: firstCode } = await auth.onboard('owner', 'first password');
    const original = await keyByPassword('first password');
    expect((await keyByRecovery(firstCode)).equals(original)).toBe(true);

    await auth.changePassword('first password', 'second password');
    expect((await keyByPassword('second password')).equals(original)).toBe(true);
    await expect(keyByPassword('first password')).rejects.toThrow();

    auth.lock();
    const { recoveryCode: secondCode } = await auth.recover(firstCode.toLowerCase(), 'third password');
    expect((await keyByPassword('third password')).equals(original)).toBe(true);
    expect((await keyByRecovery(secondCode)).equals(original)).toBe(true);
    await expect(auth.recover(firstCode, 'fourth password')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' });

    await auth.login('owner', 'third password');
    const { recoveryCode: thirdCode } = await auth.regenerateRecovery('third password');
    expect((await keyByRecovery(thirdCode)).equals(original)).toBe(true);
    await expect(keyByRecovery(secondCode)).rejects.toThrow();
  });

  it('forces a password change after a one-time .env import, then shows a recovery code', async () => {
    await freshDb();
    const auth = service();
    expect(await auth.importFromEnv('owner', 'yourchoice')).toBe(true);
    expect(await auth.importFromEnv('owner', 'yourchoice')).toBe(false);

    expect(await auth.login('owner', 'yourchoice')).toEqual({ mustChangePassword: true });
    expect(auth.status()).toEqual({ state: 'mustChangePassword', username: 'owner' });

    const { recoveryCode } = await auth.changePassword('yourchoice', 'a much better password');
    expect(recoveryCode).toMatch(CODE_FORMAT);
    expect(auth.sessionState()).toBe('unlocked');
    expect(authRow().must_change_password).toBe(0);
    expect((await keyByRecovery(recoveryCode!)).equals(await keyByPassword('a much better password'))).toBe(true);
  });

  it('verifies the password for sensitive actions and counts failures', async () => {
    await freshDb();
    const auth = service();
    await auth.onboard('owner', 'a long password');
    await expect(auth.verifyPassword('a long password')).resolves.toBeUndefined();
    await expect(auth.verifyPassword('nope')).rejects.toMatchObject({ code: 'BAD_CREDENTIALS' });
    expect(authRow().failed_attempts).toBe(1);
  });
});
