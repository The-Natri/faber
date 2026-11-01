import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { runMigrations } from './migrate.ts';
import { MIGRATIONS } from './migrations/index.ts';
import { log } from '../services/logger/index.ts';

let db: Database.Database | null = null;

export function databasePath(): string {
  const userDataPath = app.getPath('userData');
  if (!app.isPackaged && path.basename(userDataPath) !== 'natris-faber-dev') {
    throw new Error(`Refusing to open a non-dev database from a dev run: ${userDataPath}`);
  }
  return path.join(userDataPath, 'faber.db');
}

// Opens the database, switches to WAL and runs pending migrations (backing up first)
export async function initDB(backupDir: string): Promise<Database.Database> {
  const dbPath = databasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  log.info(`[DB] Opening ${dbPath}`);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const result = await runMigrations(db, MIGRATIONS, { backupDir });
  if (result.baselined) log.info('[DB] Existing v1 database: baseline migration recorded');
  if (result.backupFile) log.info(`[DB] Pre-migration backup: ${result.backupFile}`);
  log.info(result.applied.length ? `[DB] Applied migrations: ${result.applied.join(', ')}` : '[DB] Schema up to date');
  return db;
}

export function getDB(): Database.Database {
  if (!db || !db.open) throw new Error('Database is not open');
  return db;
}
