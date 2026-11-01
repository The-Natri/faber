import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import { V1_SCHEMA } from '../../db/migrations/001_baseline.ts';
import { inspectRestoreFile, listAllBackups, restoreDatabase, wipeDatabase } from './restore.ts';

let dir: string;
const known = MIGRATIONS.length;

async function makeDb(name: string, leads: number): Promise<string> {
  const file = path.join(dir, name);
  const db = new Database(file);
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'ignored') });
  for (let i = 0; i < leads; i++) {
    db.prepare(`INSERT INTO leads (osm_id, name, source) VALUES (?, ?, 'osm')`).run(`node/${i}`, `Lead ${i}`);
  }
  db.close();
  return file;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-restore-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('inspectRestoreFile', () => {
  it('accepts a Faber v2 database and reports what it holds', async () => {
    const file = await makeDb('good.db', 3);
    expect(inspectRestoreFile(file, known)).toEqual({ file, schema_version: known, counts: { leads: 3, projects: 0, payments: 0, reminders: 0 } });
  });

  it('rejects pre-v2 files, newer versions and non-databases', async () => {
    const v1 = path.join(dir, 'v1.db');
    const old = new Database(v1);
    old.exec(V1_SCHEMA);
    old.close();
    expect(() => inspectRestoreFile(v1, known)).toThrow(/not a Faber v2 backup/);

    const newer = await makeDb('newer.db', 0);
    const db = new Database(newer);
    db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, 'future')`).run(known + 1);
    db.close();
    expect(() => inspectRestoreFile(newer, known)).toThrow(/newer version/);

    const junk = path.join(dir, 'junk.db');
    fs.writeFileSync(junk, 'not sqlite at all');
    expect(() => inspectRestoreFile(junk, known)).toThrow();
  });
});

describe('restore and wipe', () => {
  it('backs up the live DB, then swaps the restore file in', async () => {
    const livePath = await makeDb('faber.db', 1);
    const restoreFrom = await makeDb('restore-me.db', 5);
    const backups = path.join(dir, 'backups');
    const live = new Database(livePath);

    await restoreDatabase(live, livePath, restoreFrom, backups, known);

    const reopened = new Database(livePath, { readonly: true });
    expect((reopened.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n).toBe(5);
    reopened.close();
    const [safety] = listAllBackups(backups);
    expect(safety.kind).toBe('pre-restore');
    const saved = new Database(path.join(backups, safety.name), { readonly: true });
    expect((saved.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n).toBe(1);
    saved.close();
  });

  it('takes a final backup before wiping', async () => {
    const livePath = await makeDb('faber.db', 2);
    const backups = path.join(dir, 'backups');
    const finalBackup = await wipeDatabase(new Database(livePath), livePath, backups);

    expect(fs.existsSync(livePath)).toBe(false);
    expect(path.basename(finalBackup)).toMatch(/^pre-reset-\d{8}-\d{6}\.db$/);
    const saved = new Database(finalBackup, { readonly: true });
    expect((saved.prepare('SELECT COUNT(*) AS n FROM leads').get() as { n: number }).n).toBe(2);
    saved.close();
  });
});
