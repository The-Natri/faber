import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, isBackupDue, listBackups, pruneBackups } from './index.ts';

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-backup-'));
  db = new Database(path.join(dir, 'faber.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE leads (id INTEGER PRIMARY KEY, name TEXT)`);
  db.prepare(`INSERT INTO leads (name) VALUES ('Cafe One'), ('Salon Two')`).run();
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const backupDir = () => path.join(dir, 'backups');
const touch = (name: string) => {
  fs.mkdirSync(backupDir(), { recursive: true });
  fs.writeFileSync(path.join(backupDir(), name), '');
};

describe('backup service', () => {
  it('writes a readable copy that includes uncheckpointed WAL writes', async () => {
    const file = await createBackup(db, backupDir(), 'manual', new Date(2026, 9, 11, 9, 5, 7));

    expect(path.basename(file)).toBe('faber-manual-20261011-090507.db');
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT COUNT(*) AS n FROM leads').get()).toEqual({ n: 2 });
    copy.close();
  });

  it('never overwrites a backup taken in the same second', async () => {
    const when = new Date(2026, 9, 11, 9, 5, 7);
    const first = await createBackup(db, backupDir(), 'auto', when);
    const second = await createBackup(db, backupDir(), 'auto', when);

    expect(path.basename(second)).toBe('faber-auto-20261011-090507-2.db');
    expect(listBackups(backupDir()).map((b) => b.file)).toEqual([second, first]);
  });

  it('keeps the newest N backups and never rotates pre-migration copies', () => {
    for (let day = 1; day <= 5; day++) touch(`faber-auto-2026100${day}-080000.db`);
    touch('faber-manual-20261006-120000.db');
    touch('pre-migration-002-20260101-000000.db');

    const removed = pruneBackups(backupDir(), 3).map((f) => path.basename(f));

    expect(removed.sort()).toEqual(['faber-auto-20261001-080000.db', 'faber-auto-20261002-080000.db', 'faber-auto-20261003-080000.db']);
    expect(fs.readdirSync(backupDir()).sort()).toEqual([
      'faber-auto-20261004-080000.db',
      'faber-auto-20261005-080000.db',
      'faber-manual-20261006-120000.db',
      'pre-migration-002-20260101-000000.db',
    ]);
  });

  it('is due when there is no backup or the newest is at least 24 h old', () => {
    expect(isBackupDue(backupDir())).toBe(true);
    touch('faber-auto-20261010-090000.db');

    expect(isBackupDue(backupDir(), new Date(2026, 9, 11, 8, 59, 59))).toBe(false);
    expect(isBackupDue(backupDir(), new Date(2026, 9, 11, 9, 0, 0))).toBe(true);
  });
});
