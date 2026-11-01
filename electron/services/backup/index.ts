import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

// Regular backups are named faber-<kind>-<YYYYMMDD-HHmmss>[-n].db and are rotated.
// Pre-migration copies (pre-migration-*.db) live in the same folder but are never rotated.
export type BackupKind = 'auto' | 'manual';

export interface BackupInfo {
  file: string;
  name: string;
  kind: BackupKind;
  stamp: string;
  createdAt: Date;
  sizeBytes: number;
}

export const DEFAULT_KEEP = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const BACKUP_NAME = /^faber-(auto|manual)-(\d{8}-\d{6})(?:-(\d+))?\.db$/;

export function fileStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function stampToDate(stamp: string): Date {
  const [d, t] = stamp.split('-');
  return new Date(
    +d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8),
    +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)
  );
}

// Picks a file name that doesn't exist yet: name.db, name-2.db, name-3.db, ...
export function uniquePath(dir: string, base: string): string {
  let candidate = path.join(dir, `${base}.db`);
  for (let n = 2; fs.existsSync(candidate); n++) {
    candidate = path.join(dir, `${base}-${n}.db`);
  }
  return candidate;
}

// Online backup: consistent even while the app keeps writing (works in WAL mode)
export async function createBackup(db: Database.Database, dir: string, kind: BackupKind, now = new Date()): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = uniquePath(dir, `faber-${kind}-${fileStamp(now)}`);
  await db.backup(file);
  return file;
}

// Newest first
export function listBackups(dir: string): BackupInfo[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((name) => ({ name, match: BACKUP_NAME.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ name, match }) => {
      const file = path.join(dir, name);
      return {
        file,
        name,
        kind: match[1] as BackupKind,
        stamp: `${match[2]}-${(match[3] ?? '1').padStart(4, '0')}`,
        createdAt: stampToDate(match[2]),
        sizeBytes: fs.statSync(file).size,
      };
    })
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
}

// Deletes regular backups beyond the newest `keep`; returns the deleted file paths
export function pruneBackups(dir: string, keep = DEFAULT_KEEP): string[] {
  const stale = listBackups(dir).slice(Math.max(keep, 1));
  for (const backup of stale) {
    fs.rmSync(backup.file, { force: true });
  }
  return stale.map((b) => b.file);
}

export function isBackupDue(dir: string, now = new Date()): boolean {
  const [latest] = listBackups(dir);
  return !latest || now.getTime() - latest.createdAt.getTime() >= DAY_MS;
}

// Backs up now if the newest backup is 24 h old (or missing), then re-checks hourly.
// Folder and keep-count are read on every check, so settings changes apply without a restart.
// Returns a function that stops the timer.
export function startAutoBackup(
  getDb: () => Database.Database,
  getDir: () => string,
  options: { getKeep?: () => number; log?: (msg: string) => void; onError?: (message: string) => void } = {}
): () => void {
  const getKeep = options.getKeep ?? (() => DEFAULT_KEEP);
  const log = options.log ?? ((msg: string) => console.log(`[Backup] ${msg}`));
  let running = false;

  const check = async () => {
    const dir = getDir();
    if (running || !isBackupDue(dir)) return;
    running = true;
    try {
      const file = await createBackup(getDb(), dir, 'auto');
      const removed = pruneBackups(dir, getKeep());
      log(`Auto backup written: ${path.basename(file)}${removed.length ? ` (rotated out ${removed.length})` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Auto backup failed: ${message}`);
      options.onError?.(message);
    } finally {
      running = false;
    }
  };

  void check();
  const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
  return () => clearInterval(timer);
}
