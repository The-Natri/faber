import type Database from 'better-sqlite3';
import { AppError, type SessionState } from '../../ipc/core.ts';
import type { AuthStatus } from '../../../shared/ipc/contract.ts';
import {
  ATTEMPTS_PER_LOCK, CURRENT_KDF, generateDataKey, generateRecoveryCode, hashSecret, lockDurationMs,
  normalizeLegacyRecoveryKey, normalizeRecoveryCode, unwrapKey, verifySecret, wrapKey, type KdfParams,
} from './crypto.ts';

interface AuthRow {
  username: string;
  password_hash: string;
  password_salt: string;
  kdf_params: string;
  recovery_hash: string | null;
  recovery_salt: string | null;
  vault_key_by_password: Buffer | null;
  vault_key_by_recovery: Buffer | null;
  failed_attempts: number;
  locked_until: string | null;
  must_change_password: number;
}

interface StoredKdf {
  password: KdfParams;
  recovery: KdfParams | null;
}

export interface AuthOptions {
  kdf?: KdfParams;
  now?: () => Date;
}

// Owns the single `auth` row and the in-memory session. The vault data key is unwrapped on
// sign-in, kept only in this process, and zeroed on lock.
export class AuthService {
  private session: Exclude<SessionState, 'onboarding'> = 'locked';
  private vaultKey: Buffer | null = null;
  private readonly kdf: KdfParams;
  private readonly now: () => Date;

  constructor(private readonly db: Database.Database, options: AuthOptions = {}) {
    this.kdf = options.kdf ?? CURRENT_KDF;
    this.now = options.now ?? (() => new Date());
  }

  private row(): AuthRow | undefined {
    return this.db.prepare('SELECT * FROM auth WHERE id = 1').get() as AuthRow | undefined;
  }

  private stored(row: AuthRow): StoredKdf {
    return JSON.parse(row.kdf_params) as StoredKdf;
  }

  sessionState(): SessionState {
    return this.row() ? this.session : 'onboarding';
  }

  status(): AuthStatus {
    const row = this.row();
    if (!row) return { state: 'onboarding' };
    if (this.session === 'unlocked') return { state: 'unlocked', username: row.username };
    if (this.session === 'mustChangePassword') return { state: 'mustChangePassword', username: row.username };
    const lockedUntil = row.locked_until && new Date(row.locked_until) > this.now() ? row.locked_until : null;
    return { state: 'locked', username: row.username, lockedUntil };
  }

  hasVaultKey(): boolean {
    return this.vaultKey !== null;
  }

  lock() {
    this.vaultKey?.fill(0);
    this.vaultKey = null;
    if (this.row()) this.session = 'locked';
  }

  // ---- Setup ----

  async onboard(username: string, password: string): Promise<{ recoveryCode: string }> {
    if (this.row()) throw new AppError('CONFLICT', 'Faber is already set up');
    const recoveryCode = generateRecoveryCode();
    const dataKey = generateDataKey();
    const creds = await this.credentials(password, recoveryCode, dataKey);

    this.db.prepare(`
      INSERT INTO auth (id, username, password_hash, password_salt, kdf_params, recovery_hash, recovery_salt,
                        vault_key_by_password, vault_key_by_recovery)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(username, creds.password.hash, creds.password.salt, creds.kdfParams,
      creds.recovery.hash, creds.recovery.salt, creds.byPassword, creds.byRecovery);

    this.unlock(dataKey, false);
    return { recoveryCode };
  }

  // One-time import of v1 .env credentials when nothing else exists; the password must be changed at next sign-in
  async importFromEnv(username: string | undefined, password: string | undefined): Promise<boolean> {
    if (this.row() || !username || !password) return false;
    const hashed = await hashSecret(password, this.kdf);
    this.db.prepare(`
      INSERT INTO auth (id, username, password_hash, password_salt, kdf_params, must_change_password)
      VALUES (1, ?, ?, ?, ?, 1)
    `).run(username, hashed.hash, hashed.salt, JSON.stringify({ password: this.kdf, recovery: null }));
    return true;
  }

  // ---- Sign in ----

  // A login from the interim build or a .env import still has legacy hashes, no vault key or
  // no base32 recovery code. Such a first v2 sign-in must change the password; the upgrade
  // happens in changePassword().
  private needsUpgrade(row: AuthRow): boolean {
    const kdf = this.stored(row);
    return kdf.password.legacy === true || kdf.recovery?.legacy === true
      || !row.recovery_hash || !row.vault_key_by_password || !row.vault_key_by_recovery;
  }

  async login(username: string, password: string): Promise<{ mustChangePassword: boolean }> {
    const row = this.requireRow();
    this.assertNotLockedOut(row);

    // Always run the hash so a wrong username takes as long as a wrong password
    const passwordOk = await this.checkPassword(row, password);
    if (username.trim() !== row.username || !passwordOk) {
      this.registerFailure(row, 'Wrong username or password.');
    }

    if (this.needsUpgrade(row)) {
      // Persisted, so quitting before the change still forces it next time
      this.db.prepare(`UPDATE auth SET must_change_password = 1, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1`).run();
      this.vaultKey?.fill(0);
      this.vaultKey = null;
      this.session = 'mustChangePassword';
      return { mustChangePassword: true };
    }

    const kdf = this.stored(row);
    const dataKey = await unwrapKey(row.vault_key_by_password!, password);
    if (kdf.password.N !== this.kdf.N) {
      const hashed = await hashSecret(password, this.kdf);
      this.db.prepare(`UPDATE auth SET password_hash = ?, password_salt = ?, kdf_params = ?, updated_at = datetime('now') WHERE id = 1`)
        .run(hashed.hash, hashed.salt, JSON.stringify({ ...kdf, password: this.kdf }));
    }
    this.resetFailures();

    const mustChange = row.must_change_password === 1;
    this.unlock(dataKey, mustChange);
    return { mustChangePassword: mustChange };
  }

  async verifyPassword(password: string): Promise<void> {
    const row = this.requireRow();
    this.assertNotLockedOut(row);
    if (!(await this.checkPassword(row, password))) this.registerFailure(row, 'Wrong password.');
    this.resetFailures();
  }

  // ---- Changing secrets ----

  // Returns a new recovery code when this change completes a first-v2 upgrade (shown once);
  // the old hex key stops working at that moment.
  async changePassword(currentPassword: string, newPassword: string): Promise<{ recoveryCode: string | null }> {
    const row = this.requireRow();
    this.assertNotLockedOut(row);
    if (!(await this.checkPassword(row, currentPassword))) this.registerFailure(row, 'Current password is incorrect.');
    if (currentPassword === newPassword) throw new AppError('CONFLICT', 'Choose a password different from the current one.');

    if (this.needsUpgrade(row)) {
      const dataKey = row.vault_key_by_password ? await unwrapKey(row.vault_key_by_password, currentPassword) : generateDataKey();
      const recoveryCode = generateRecoveryCode();
      const creds = await this.credentials(newPassword, recoveryCode, dataKey);
      this.db.prepare(`
        UPDATE auth SET password_hash = ?, password_salt = ?, kdf_params = ?, recovery_hash = ?, recovery_salt = ?,
                        vault_key_by_password = ?, vault_key_by_recovery = ?, must_change_password = 0,
                        failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
        WHERE id = 1
      `).run(creds.password.hash, creds.password.salt, creds.kdfParams, creds.recovery.hash, creds.recovery.salt,
        creds.byPassword, creds.byRecovery);
      this.unlock(dataKey, false);
      dataKey.fill(0);
      return { recoveryCode };
    }

    const dataKey = await this.currentDataKey(row, currentPassword);
    const hashed = await hashSecret(newPassword, this.kdf);
    const byPassword = await wrapKey(dataKey, newPassword, this.kdf);
    const kdf = this.stored(row);

    this.db.prepare(`
      UPDATE auth SET password_hash = ?, password_salt = ?, kdf_params = ?, vault_key_by_password = ?,
                      must_change_password = 0, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
      WHERE id = 1
    `).run(hashed.hash, hashed.salt, JSON.stringify({ ...kdf, password: this.kdf }), byPassword);

    this.unlock(dataKey, false);
    return { recoveryCode: null };
  }

  // Forgot password: the recovery code unwraps the vault key, so nothing in the vault is lost
  async recover(code: string, newPassword: string): Promise<{ username: string; recoveryCode: string }> {
    const row = this.requireRow();
    this.assertNotLockedOut(row);
    const kdf = this.stored(row);
    if (!row.recovery_hash || !row.recovery_salt || !kdf.recovery) {
      throw new AppError('CONFLICT', 'No recovery code is set up yet. Sign in once to create one.');
    }

    const legacy = kdf.recovery.legacy === true;
    const normalized = legacy ? normalizeLegacyRecoveryKey(code) : normalizeRecoveryCode(code);
    if (!(await verifySecret(normalized, row.recovery_hash, row.recovery_salt, kdf.recovery))) {
      this.registerFailure(row, 'That recovery code is not valid.');
    }

    const dataKey = !legacy && row.vault_key_by_recovery
      ? await unwrapKey(row.vault_key_by_recovery, normalized)
      : generateDataKey();
    const recoveryCode = generateRecoveryCode();
    const creds = await this.credentials(newPassword, recoveryCode, dataKey);
    dataKey.fill(0);

    this.db.prepare(`
      UPDATE auth SET password_hash = ?, password_salt = ?, kdf_params = ?, recovery_hash = ?, recovery_salt = ?,
                      vault_key_by_password = ?, vault_key_by_recovery = ?, must_change_password = 0,
                      failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
      WHERE id = 1
    `).run(creds.password.hash, creds.password.salt, creds.kdfParams, creds.recovery.hash, creds.recovery.salt,
      creds.byPassword, creds.byRecovery);

    this.lock();
    return { username: row.username, recoveryCode };
  }

  async regenerateRecovery(password: string): Promise<{ recoveryCode: string }> {
    const row = this.requireRow();
    this.assertNotLockedOut(row);
    if (!(await this.checkPassword(row, password))) this.registerFailure(row, 'Wrong password.');

    const dataKey = await this.currentDataKey(row, password);
    const recoveryCode = generateRecoveryCode();
    const recovery = await hashSecret(normalizeRecoveryCode(recoveryCode), this.kdf);
    const byRecovery = await wrapKey(dataKey, normalizeRecoveryCode(recoveryCode), this.kdf);
    const kdf = this.stored(row);

    this.db.prepare(`
      UPDATE auth SET recovery_hash = ?, recovery_salt = ?, kdf_params = ?, vault_key_by_recovery = ?,
                      failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
      WHERE id = 1
    `).run(recovery.hash, recovery.salt, JSON.stringify({ ...kdf, recovery: this.kdf }), byRecovery);
    return { recoveryCode };
  }

  // ---- Internals ----

  private requireRow(): AuthRow {
    const row = this.row();
    if (!row) throw new AppError('CONFLICT', 'Set up Faber first.');
    return row;
  }

  // The unwrapped vault key: from the session if signed in, otherwise unwrapped with the password
  private async currentDataKey(row: AuthRow, password: string): Promise<Buffer> {
    if (this.vaultKey) return this.vaultKey;
    if (row.vault_key_by_password) return unwrapKey(row.vault_key_by_password, password);
    throw new AppError('CONFLICT', 'Sign in once before changing secrets.');
  }

  private unlock(dataKey: Buffer, mustChange: boolean) {
    if (this.vaultKey && this.vaultKey !== dataKey) this.vaultKey.fill(0);
    this.vaultKey = Buffer.from(dataKey);
    this.session = mustChange ? 'mustChangePassword' : 'unlocked';
  }

  private async checkPassword(row: AuthRow, password: string): Promise<boolean> {
    return verifySecret(password, row.password_hash, row.password_salt, this.stored(row).password);
  }

  private async credentials(password: string, recoveryCode: string, dataKey: Buffer) {
    const normalized = normalizeRecoveryCode(recoveryCode);
    const [passwordHash, recoveryHash, byPassword, byRecovery] = await Promise.all([
      hashSecret(password, this.kdf),
      hashSecret(normalized, this.kdf),
      wrapKey(dataKey, password, this.kdf),
      wrapKey(dataKey, normalized, this.kdf),
    ]);
    return {
      password: passwordHash,
      recovery: recoveryHash,
      byPassword,
      byRecovery,
      kdfParams: JSON.stringify({ password: this.kdf, recovery: this.kdf } satisfies StoredKdf),
    };
  }

  private assertNotLockedOut(row: AuthRow) {
    if (row.locked_until && new Date(row.locked_until) > this.now()) {
      const seconds = Math.ceil((new Date(row.locked_until).getTime() - this.now().getTime()) / 1000);
      throw new AppError('LOCKED_OUT', `Too many failed attempts. Try again in ${formatWait(seconds)}.`);
    }
  }

  private registerFailure(row: AuthRow, message: string): never {
    const attempts = row.failed_attempts + 1;
    const lockMs = lockDurationMs(attempts);
    const lockedUntil = lockMs > 0 ? new Date(this.now().getTime() + lockMs).toISOString() : null;
    this.db.prepare(`UPDATE auth SET failed_attempts = ?, locked_until = ?, updated_at = datetime('now') WHERE id = 1`)
      .run(attempts, lockedUntil);

    if (lockMs > 0) {
      throw new AppError('LOCKED_OUT', `${message} Too many failed attempts. Try again in ${formatWait(lockMs / 1000)}.`);
    }
    const left = ATTEMPTS_PER_LOCK - (attempts % ATTEMPTS_PER_LOCK);
    throw new AppError('BAD_CREDENTIALS', `${message} ${left} ${left === 1 ? 'attempt' : 'attempts'} left before a short lock.`);
  }

  private resetFailures() {
    this.db.prepare(`UPDATE auth SET failed_attempts = 0, locked_until = NULL WHERE id = 1 AND (failed_attempts > 0 OR locked_until IS NOT NULL)`).run();
  }
}

function formatWait(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s < 60) return `${s} seconds`;
  const m = Math.ceil(s / 60);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}
