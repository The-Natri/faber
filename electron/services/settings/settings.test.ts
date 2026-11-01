import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import { SettingsService, type SecretBox } from './index.ts';

let dir: string;
let db: Database.Database;

// Reversible stand-in for safeStorage
const fakeBox = (available = true): SecretBox => ({
  available: () => available,
  encrypt: (plain) => Buffer.from(`enc:${plain}`).toString('base64'),
  decrypt: (cipher) => {
    const text = Buffer.from(cipher, 'base64').toString();
    if (!text.startsWith('enc:')) throw new Error('cannot decrypt');
    return text.slice(4);
  },
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-settings-'));
  db = new Database(path.join(dir, 'faber.db'));
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SettingsService', () => {
  it('returns defaults when nothing is stored', () => {
    const settings = new SettingsService(db, fakeBox()).all();
    expect(settings.profile.businessName).toBe("Natri's Faber");
    expect(settings.profile.gstRegistered).toBe(false);
    expect(settings.security.autoLockMinutes).toBe(15);
    expect(settings.appearance.theme).toBe('nocturne');
    expect(settings.outreach).toEqual({ followUpDays: [3, 7, 14], dailyGoal: 10, defaultLanguage: 'en' });
    expect(settings.integrations.claudeModel).toBe('claude-haiku-5-5');
    expect(settings.backups).toEqual({ folder: null, keep: 14 });
  });

  it('merges updates into a section and persists them', () => {
    const service = new SettingsService(db, fakeBox());
    service.update('profile', { yourName: 'Owner', upiId: 'owner@okbank' });
    const again = new SettingsService(db, fakeBox()).get('profile');
    expect(again).toMatchObject({ yourName: 'Owner', upiId: 'owner@okbank', businessName: "Natri's Faber" });
  });

  it('rejects invalid values and keeps the old ones', () => {
    const service = new SettingsService(db, fakeBox());
    expect(() => service.update('profile', { upiId: 'not-a-upi' })).toThrow(/UPI ID/);
    expect(() => service.update('profile', { gstRegistered: true })).toThrow(/GSTIN is required/);
    expect(() => service.update('profile', { gstRegistered: true, gstin: 'BAD' })).toThrow(/15 characters/);
    expect(() => service.update('security', { autoLockMinutes: -1 })).toThrow();
    expect(service.get('profile').upiId).toBe('');

    service.update('profile', { gstRegistered: true, gstin: '33abcde1234f1z5' });
    expect(service.get('profile').gstin).toBe('33ABCDE1234F1Z5');
  });

  it('notifies listeners after a successful update only', () => {
    const service = new SettingsService(db, fakeBox());
    const seen: string[] = [];
    service.onChange((section) => seen.push(section));
    service.update('backups', { keep: 7 });
    expect(() => service.update('backups', { keep: 0 })).toThrow();
    expect(seen).toEqual(['backups']);
  });

  it('stores secrets encrypted and only ever shows them masked', () => {
    const service = new SettingsService(db, fakeBox());
    const view = service.setSecret('claudeApiKey', 'sk-ant-1234567890abcd');

    expect(view.secrets.claudeApiKey).toEqual({ set: true, masked: '••••••••abcd' });
    expect(JSON.stringify(view)).not.toContain('sk-ant');
    const stored = db.prepare(`SELECT value FROM app_settings WHERE key = 'secret:claudeApiKey'`).get() as { value: string };
    expect(stored.value).not.toContain('sk-ant');
    expect(service.getSecret('claudeApiKey')).toBe('sk-ant-1234567890abcd');

    expect(service.setSecret('claudeApiKey', null).secrets.claudeApiKey).toEqual({ set: false, masked: '' });
  });

  it('refuses to store secrets without secure storage and treats unreadable ones as unset', () => {
    expect(() => new SettingsService(db, fakeBox(false)).setSecret('telegramBotToken', '123:abc')).toThrow(/secure storage/);

    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('secret:telegramBotToken', 'from-another-machine')`).run();
    const service = new SettingsService(db, fakeBox());
    expect(service.getSecret('telegramBotToken')).toBeNull();
    expect(service.view().secrets.telegramBotToken.set).toBe(false);
  });
});
