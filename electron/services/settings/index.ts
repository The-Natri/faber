import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import { log } from '../logger/index.ts';
import {
  SECRET_NAMES, SETTINGS_SCHEMAS, SETTINGS_SECTIONS,
  type AppSettings, type MaskedSecret, type SecretName, type SettingsSection, type SettingsView,
} from '../../../shared/settings.ts';

// Encrypts secrets at rest. In the app this is Electron's safeStorage (tied to this Windows user
// and machine); tests pass a fake.
export interface SecretBox {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

type Listener = (section: SettingsSection, settings: AppSettings) => void;

const secretKey = (name: SecretName) => `secret:${name}`;

export function maskSecret(value: string): string {
  return value.length <= 8 ? '••••' : `••••••••${value.slice(-4)}`;
}

export class SettingsService {
  private listeners: Listener[] = [];

  constructor(private readonly db: Database.Database, private readonly box: SecretBox) {}

  private raw(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  private write(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  get<K extends SettingsSection>(section: K): AppSettings[K] {
    const schema = SETTINGS_SCHEMAS[section];
    let stored: unknown = {};
    try {
      stored = JSON.parse(this.raw(section) ?? '{}');
    } catch {
      log.warn(`[Settings] ${section} was not valid JSON; using defaults`);
    }
    const parsed = schema.safeParse(stored);
    if (parsed.success) return parsed.data as AppSettings[K];
    log.warn(`[Settings] ${section} failed validation; using defaults`);
    return schema.parse({}) as AppSettings[K];
  }

  all(): AppSettings {
    return Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, this.get(s)])) as AppSettings;
  }

  view(): SettingsView {
    const secrets = Object.fromEntries(SECRET_NAMES.map((name) => [name, this.maskedSecret(name)])) as Record<SecretName, MaskedSecret>;
    return { settings: this.all(), secrets, secretStorageAvailable: this.box.available() };
  }

  // Merges the given fields into the section and validates the whole section
  update(section: SettingsSection, values: Record<string, unknown>): SettingsView {
    const merged = { ...this.get(section), ...values };
    const parsed = SETTINGS_SCHEMAS[section].safeParse(merged);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError('VALIDATION', issue?.message ?? `Invalid ${section} settings`);
    }
    this.write(section, JSON.stringify(parsed.data));
    const settings = this.all();
    for (const listener of this.listeners) listener(section, settings);
    return this.view();
  }

  onChange(listener: Listener) {
    this.listeners.push(listener);
  }

  setSecret(name: SecretName, value: string | null): SettingsView {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(secretKey(name));
      return this.view();
    }
    if (!this.box.available()) {
      throw new AppError('UNAVAILABLE', 'Windows secure storage is not available, so secrets cannot be saved.');
    }
    this.write(secretKey(name), this.box.encrypt(trimmed));
    return this.view();
  }

  // Main process only — never send the result to the renderer
  getSecret(name: SecretName): string | null {
    const cipher = this.raw(secretKey(name));
    if (!cipher) return null;
    try {
      return this.box.decrypt(cipher);
    } catch {
      // Typically a backup restored on another machine: safeStorage can't read it here
      log.warn(`[Settings] Stored ${name} can't be decrypted on this machine; it needs to be entered again`);
      return null;
    }
  }

  private maskedSecret(name: SecretName): MaskedSecret {
    const value = this.getSecret(name);
    return value ? { set: true, masked: maskSecret(value) } : { set: false, masked: '' };
  }
}
