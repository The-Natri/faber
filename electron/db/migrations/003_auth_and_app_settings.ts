import type { Migration } from '../migrate.ts';

// v2 auth and settings. The interim build kept its login in `settings` as
// username / password_hash / recovery_key_hash, each hash "salt:hash" from scryptSync with
// Node's defaults (N=16384, r=8, p=1, 64-byte key) and the hex salt string used as-is (UTF-8).
// Those values move into `auth` marked legacy; the first v2 login verifies them, re-hashes with
// the current parameters and issues a base32 recovery code (services/auth).
const LEGACY_KDF = { algo: 'scrypt', N: 16384, r: 8, p: 1, keylen: 64, saltEncoding: 'utf8', legacy: true };

export const authAndAppSettings: Migration = {
  version: 3,
  name: 'auth_and_app_settings',
  up: (db) => {
    db.exec(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        kdf_params TEXT NOT NULL,
        recovery_hash TEXT,
        recovery_salt TEXT,
        vault_key_by_password BLOB,
        vault_key_by_recovery BLOB,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN ('username', 'password_hash', 'recovery_key_hash')`)
      .all() as { key: string; value: string }[];
    const value = (key: string) => rows.find((r) => r.key === key)?.value ?? null;

    const user = value('username');
    const passwordHash = value('password_hash');
    if (!user || !passwordHash || !passwordHash.includes(':')) return;

    const [passwordSalt, passwordDigest] = passwordHash.split(':');
    const recovery = value('recovery_key_hash');
    const [recoverySalt, recoveryDigest] = recovery?.includes(':') ? recovery.split(':') : [null, null];

    db.prepare(`
      INSERT INTO auth (id, username, password_hash, password_salt, kdf_params, recovery_hash, recovery_salt)
      VALUES (1, ?, ?, ?, ?, ?, ?)
    `).run(
      user,
      passwordDigest,
      passwordSalt,
      JSON.stringify({ password: LEGACY_KDF, recovery: LEGACY_KDF }),
      recoveryDigest,
      recoverySalt
    );

    db.prepare(`DELETE FROM settings WHERE key IN ('username', 'password_hash', 'recovery_key_hash')`).run();
  },
};
