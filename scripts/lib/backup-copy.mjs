// Shared by refresh-dev-db.mjs and ship.mjs: copy the newest backup of the installed app's
// database into another data folder. Only reads the installed app's backups folder; never opens
// its live faber.db.
import fs from 'node:fs';
import path from 'node:path';

export function appDataDir() {
  const appData = process.env.APPDATA;
  if (!appData) throw new Error('APPDATA is not set; this script expects Windows.');
  return appData;
}

export function newestBackup(backupDir = path.join(appDataDir(), 'natris-faber', 'backups')) {
  if (!fs.existsSync(backupDir)) throw new Error(`No backup folder at ${backupDir}. Make a backup in the installed app first.`);
  const backups = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ file: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (backups.length === 0) throw new Error(`No .db backups in ${backupDir}. Make a backup in the installed app first.`);
  return backups[0].file;
}

// Replaces <targetDir>/faber.db with a copy of `backupFile`. Never touches natris-faber itself.
export function copyBackupInto(backupFile, targetDir) {
  if (path.basename(targetDir).toLowerCase() === 'natris-faber') {
    throw new Error('Refusing to overwrite the installed app\'s own data folder.');
  }
  const db = path.join(targetDir, 'faber.db');
  fs.mkdirSync(targetDir, { recursive: true });
  // Drop the old DB together with its WAL side files so stale pages can't be replayed onto the copy
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(db + suffix, { force: true });
  fs.copyFileSync(backupFile, db);
  return db;
}
