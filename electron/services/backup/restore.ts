import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { BackupEntry, RestoreCandidate } from '../../../shared/types.ts';
import { fileStamp, uniquePath } from './index.ts';

const COUNTED_TABLES = ['leads', 'projects', 'payments', 'reminders'];
const ANY_BACKUP = /^(faber-(auto|manual)|pre-(migration|restore|reset))-.*\.db$/;

// Every backup in the folder, including the never-rotated safety copies, newest first
export function listAllBackups(dir: string): BackupEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => ANY_BACKUP.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      const kind = name.startsWith('faber-auto') ? 'auto'
        : name.startsWith('faber-manual') ? 'manual'
          : name.split('-').slice(0, 2).join('-');
      return { name, kind, created_at: stat.mtime.toISOString(), size_bytes: stat.size };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Checks a file before it may replace the live database
export function inspectRestoreFile(file: string, knownVersion: number): RestoreCandidate {
  let candidate: Database.Database;
  try {
    candidate = new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    throw new AppError('VALIDATION', 'That file could not be opened as a database.');
  }
  try {
    const tables = new Set((candidate.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map((t) => t.name));
    if (!tables.has('schema_migrations')) {
      throw new AppError('VALIDATION', 'That file is not a Faber v2 backup (it has no migration history).');
    }
    const integrity = (candidate.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    if (integrity !== 'ok') throw new AppError('VALIDATION', 'That backup is damaged and cannot be restored.');

    const version = (candidate.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0;
    if (version > knownVersion) {
      throw new AppError('VALIDATION', 'That backup was made by a newer version of Faber. Update Faber before restoring it.');
    }
    const counts = Object.fromEntries(COUNTED_TABLES.filter((t) => tables.has(t)).map((t) =>
      [t, (candidate.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
    return { file, schema_version: version, counts };
  } finally {
    candidate.close();
  }
}

function removeDbFiles(dbPath: string) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
}

// Backs up the live DB, closes it and swaps the chosen file in. The caller relaunches the app,
// and startup runs any pending migrations on the restored file.
export async function restoreDatabase(db: Database.Database, dbPath: string, file: string, backupDir: string, knownVersion: number) {
  inspectRestoreFile(file, knownVersion);
  fs.mkdirSync(backupDir, { recursive: true });
  await db.backup(uniquePath(backupDir, `pre-restore-${fileStamp()}`));
  db.close();
  removeDbFiles(dbPath);
  fs.copyFileSync(file, dbPath);
}

// Takes a final backup, then removes the database (with its settings and stored secrets).
// The next start creates an empty database and shows onboarding.
export async function wipeDatabase(db: Database.Database, dbPath: string, backupDir: string): Promise<string> {
  fs.mkdirSync(backupDir, { recursive: true });
  const finalBackup = uniquePath(backupDir, `pre-reset-${fileStamp()}`);
  await db.backup(finalBackup);
  db.close();
  removeDbFiles(dbPath);
  return finalBackup;
}
