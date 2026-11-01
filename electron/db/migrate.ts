import fs from 'fs';
import type Database from 'better-sqlite3';
import { V1_TABLES } from './migrations/001_baseline.ts';
import { fileStamp, uniquePath } from '../services/backup/index.ts';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export interface MigrationResult {
  baselined: boolean;
  applied: number[];
  backupFile: string | null;
}

function validate(migrations: Migration[]) {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migrations must be numbered 1, 2, 3… in order; found version ${m.version} at position ${i + 1}`);
    }
  });
}

function existingTables(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

// Brings the database up to the newest migration. Each migration runs in its own transaction,
// so a failure leaves the DB at the last fully applied version. When the DB already holds data,
// it is copied to backupDir/pre-migration-<version>-<timestamp>.db before anything is applied.
export async function runMigrations(
  db: Database.Database,
  migrations: Migration[],
  options: { backupDir: string; now?: Date }
): Promise<MigrationResult> {
  validate(migrations);

  // Work out what needs doing before writing anything, so the backup is the untouched original
  const tablesBefore = existingTables(db);
  const hasHistory = tablesBefore.has('schema_migrations');
  const hasData = [...tablesBefore].some((t) => t !== 'schema_migrations');

  const done = new Set(hasHistory
    ? (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version)
    : []);

  const unknown = [...done].filter((v) => v > migrations.length);
  if (unknown.length > 0) {
    throw new Error(`Database has migrations this app doesn't know (${unknown.join(', ')}); it was opened by a newer version`);
  }

  // A database made by v1 has the v1 tables but no migration history: the baseline counts as applied
  let baselined = false;
  if (done.size === 0) {
    const present = V1_TABLES.filter((t) => tablesBefore.has(t));
    if (present.length === V1_TABLES.length) {
      baselined = true;
    } else if (present.length > 0) {
      throw new Error(`Database has only some v1 tables (${present.join(', ')}); refusing to migrate an unknown schema`);
    }
  }

  const pending = migrations.filter((m) => !done.has(m.version) && !(baselined && m.version === 1));

  let backupFile: string | null = null;
  if (hasData && pending.length > 0) {
    fs.mkdirSync(options.backupDir, { recursive: true });
    const version = String(pending[0].version).padStart(3, '0');
    backupFile = uniquePath(options.backupDir, `pre-migration-${version}-${fileStamp(options.now)}`);
    await db.backup(backupFile);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const recordApplied = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
  if (baselined) {
    recordApplied.run(migrations[0].version, migrations[0].name);
  }

  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db);
      recordApplied.run(migration.version, migration.name);
    })();
  }

  return { baselined, applied: pending.map((m) => m.version), backupFile };
}
