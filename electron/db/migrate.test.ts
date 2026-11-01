import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations, type Migration } from './migrate.ts';
import { MIGRATIONS } from './migrations/index.ts';
import { V1_SCHEMA, V1_TABLES } from './migrations/001_baseline.ts';
import { normalizeCity, placeCity } from '../services/leads/city.ts';
import { SEED_CHAIN_PATTERNS } from '../services/leads/chain.ts';

let dir: string;
let db: Database.Database;

const tables = (d: Database.Database) =>
  (d.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[])
    .map((r) => r.name);

const counts = (d: Database.Database, names: string[]) =>
  Object.fromEntries(names.map((t) => [t, (d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));

const versions = (d: Database.Database) =>
  (d.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]).map((r) => r.version);

// A database shaped like the one v1 creates, with a few rows in every table
function seedV1(d: Database.Database) {
  d.exec(V1_SCHEMA);
  d.prepare(`INSERT INTO leads (osm_id, name, category, source, city) VALUES ('node/1', 'Cafe One', 'Cafes', 'osm', 'Coimbatore')`).run();
  d.prepare(`INSERT INTO leads (osm_id, name, category, source, city) VALUES ('way/2', 'Salon Two', 'Salons', 'osm', 'Chennai')`).run();
  d.prepare(`INSERT INTO projects (name, stage, payment_agreed, payment_received) VALUES ('Sample Project', 'maintenance', 10000, 4000)`).run();
  d.prepare(`INSERT INTO payments (project_id, amount, type, status) VALUES (1, 4000, 'advance', 'received')`).run();
  d.prepare(`INSERT INTO reminders (entity_type, entity_id, message, due_date, is_done) VALUES ('lead', 1, 'Call back', '2026-08-01', 1)`).run();
  d.prepare(`INSERT INTO work_log (project_id, entry) VALUES (1, 'Kickoff')`).run();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-migrate-'));
  db = new Database(path.join(dir, 'faber.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const backupDir = () => path.join(dir, 'backups');
const ALL = MIGRATIONS.map((m) => m.version);
const AFTER_BASELINE = ALL.filter((v) => v > 1);

describe('runMigrations', () => {
  it('creates the full schema on a fresh database without taking a backup', async () => {
    const result = await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    expect(result).toEqual({ baselined: false, applied: ALL, backupFile: null });
    expect(tables(db)).toEqual(expect.arrayContaining([...V1_TABLES, 'settings', 'auth', 'app_settings', 'schema_migrations']));
    expect(versions(db)).toEqual(ALL);
    expect(fs.existsSync(backupDir())).toBe(false);
  });

  it('baselines a v1 database without touching its rows, after backing it up', async () => {
    seedV1(db);
    const before = counts(db, V1_TABLES);

    const result = await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    expect(result.baselined).toBe(true);
    expect(result.applied).toEqual(AFTER_BASELINE);
    expect(versions(db)).toEqual(ALL);
    expect(counts(db, V1_TABLES)).toEqual(before);
    expect(db.prepare('SELECT payment_agreed, payment_received FROM projects').get()).toEqual({ payment_agreed: 10000, payment_received: 4000 });

    expect(result.backupFile).toMatch(/pre-migration-002-\d{8}-\d{6}\.db$/);
    const backup = new Database(result.backupFile!, { readonly: true });
    const backupCounts = counts(backup, V1_TABLES);
    const backupTables = tables(backup);
    backup.close();
    expect(backupCounts).toEqual(before);
    expect(backupTables).not.toContain('schema_migrations');
  });

  it('keeps an existing interim settings table and its unrelated rows', async () => {
    seedV1(db);
    db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('something_else', 'kept')`).run();

    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    expect(db.prepare(`SELECT value FROM settings WHERE key = 'something_else'`).get()).toEqual({ value: 'kept' });
  });

  it('moves the interim login into auth as legacy hashes and retires the settings rows', async () => {
    seedV1(db);
    db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const insert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
    insert.run('username', 'owner');
    insert.run('password_hash', 'aa11:bb22');
    insert.run('recovery_key_hash', 'cc33:dd44');

    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    const auth = db.prepare(`SELECT * FROM auth`).get() as Record<string, unknown>;
    expect(auth).toMatchObject({
      id: 1, username: 'owner', password_salt: 'aa11', password_hash: 'bb22',
      recovery_salt: 'cc33', recovery_hash: 'dd44', failed_attempts: 0, must_change_password: 0,
    });
    const kdf = JSON.parse(auth.kdf_params as string);
    expect(kdf.password).toMatchObject({ N: 16384, keylen: 64, saltEncoding: 'utf8', legacy: true });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM settings`).get()).toEqual({ n: 0 });
  });

  it('does nothing on a second run', async () => {
    seedV1(db);
    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });
    const backupsAfterFirst = fs.readdirSync(backupDir()).length;

    const second = await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    expect(second).toEqual({ baselined: false, applied: [], backupFile: null });
    expect(fs.readdirSync(backupDir()).length).toBe(backupsAfterFirst);
  });

  it('rolls back a migration that fails midway and keeps earlier ones', async () => {
    seedV1(db);
    const failing: Migration = {
      version: MIGRATIONS.length + 1,
      name: 'fails_midway',
      up: (d) => {
        d.exec('CREATE TABLE half_written (id INTEGER)');
        d.prepare(`UPDATE projects SET payment_received = 0`).run();
        throw new Error('boom');
      },
    };

    await expect(runMigrations(db, [...MIGRATIONS, failing], { backupDir: backupDir() })).rejects.toThrow('boom');

    expect(versions(db)).toEqual(ALL);
    expect(tables(db)).not.toContain('half_written');
    expect(db.prepare('SELECT payment_received FROM projects').get()).toEqual({ payment_received: 4000 });
  });

  it('refuses a database with only some of the v1 tables', async () => {
    db.exec(`CREATE TABLE leads (id INTEGER PRIMARY KEY)`);
    await expect(runMigrations(db, MIGRATIONS, { backupDir: backupDir() })).rejects.toThrow(/only some v1 tables/);
  });

  it('refuses a database migrated by a newer app version', async () => {
    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });
    db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (99, 'future')`).run();
    await expect(runMigrations(db, MIGRATIONS, { backupDir: backupDir() })).rejects.toThrow(/newer version/);
  });

  it('rejects migration lists that are out of order', async () => {
    const [first, second] = MIGRATIONS;
    await expect(runMigrations(db, [second, first], { backupDir: backupDir() })).rejects.toThrow(/numbered/);
  });
});

describe('migrations 004 to 006', () => {
  it('adds deleted_at everywhere and respells only the known city variants', async () => {
    seedV1(db);
    const insert = db.prepare(`INSERT INTO leads (osm_id, name, source, city) VALUES (?, ?, 'osm', ?)`);
    insert.run('node/10', 'A', 'coimbatore');
    insert.run('node/11', 'B', '  Coimbatore ');
    insert.run('node/12', 'C', 'கோயம்புத்தூர்');
    insert.run('node/13', 'D', 'CHENNAI');
    insert.run('node/14', 'E', 'Peelamedu');
    insert.run('node/15', 'F', null);

    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    for (const t of ['leads', 'projects', 'payments', 'reminders']) {
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      expect(cols).toContain('deleted_at');
    }
    const city = (osm: string) => (db.prepare('SELECT city FROM leads WHERE osm_id = ?').get(osm) as { city: string | null }).city;
    expect(['node/10', 'node/11', 'node/12', 'node/13', 'node/14', 'node/15'].map(city))
      .toEqual(['Coimbatore', 'Coimbatore', 'Coimbatore', 'Chennai', 'Coimbatore', null]);
  });

  it('folds Coimbatore localities into the city and keeps the locality in the address', async () => {
    seedV1(db);
    const insert = db.prepare(`INSERT INTO leads (osm_id, name, source, city, address) VALUES (?, ?, 'osm', ?, ?)`);
    insert.run('node/20', 'A', 'Masakalipalayam', 'Jeganadhan Road, Avinashi Road, Masakalipalayam');
    insert.run('node/21', 'B', 'peelamedu', 'Avinashi Road');
    insert.run('node/22', 'C', 'Peelamedu', null);
    insert.run('node/23', 'D', 'Ganapathy', 'Sathy Road');

    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });

    const row = (osm: string) => db.prepare('SELECT city, address FROM leads WHERE osm_id = ?').get(osm);
    expect(['node/20', 'node/21', 'node/22', 'node/23'].map(row)).toEqual([
      { city: 'Coimbatore', address: 'Jeganadhan Road, Avinashi Road, Masakalipalayam' },
      { city: 'Coimbatore', address: 'Avinashi Road, peelamedu' },
      { city: 'Coimbatore', address: 'Peelamedu' },
      { city: 'Ganapathy', address: 'Sathy Road' },
    ]);
  });
});

describe('migrations 007 and 008', () => {
  it('007 seeds the chain blocklist and flags no lead', async () => {
    seedV1(db);
    db.prepare(`INSERT INTO leads (osm_id, name, source) VALUES ('node/30', 'Starbucks', 'osm')`).run();
    await runMigrations(db, MIGRATIONS.filter((m) => m.version <= 7), { backupDir: backupDir() });
    const seeded = (db.prepare(`SELECT pattern FROM chain_blocklist WHERE source = 'seed' ORDER BY id`).all() as { pattern: string }[]).map((r) => r.pattern);
    expect(seeded).toEqual([...SEED_CHAIN_PATTERNS]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM leads WHERE is_chain = 1 OR chain_reason IS NOT NULL').get()).toEqual({ n: 0 });
  });

  it('008 adds the two misspellings and flags every blocklist match', async () => {
    seedV1(db);
    const insert = db.prepare(`INSERT INTO leads (osm_id, name, source) VALUES (?, ?, 'osm')`);
    ['Starbucks', 'Cafe Caffee Day', 'Cafe Cofee Day', "GOLD'S GYM", 'Corner Cafe', 'Chai Kingdom'].forEach((name, i) => insert.run(`node/${40 + i}`, name));
    await runMigrations(db, MIGRATIONS, { backupDir: backupDir() });
    expect(db.prepare(`SELECT pattern FROM chain_blocklist WHERE source = 'manual' ORDER BY id`).all())
      .toEqual([{ pattern: 'Cafe Caffee Day' }, { pattern: 'Cafe Cofee Day' }]);
    expect(db.prepare(`SELECT name FROM leads WHERE is_chain = 1 AND chain_reason = 'blocklist' ORDER BY id`).all().map((r) => (r as { name: string }).name))
      .toEqual(['Starbucks', 'Cafe Caffee Day', 'Cafe Cofee Day', "GOLD'S GYM"]);
  });
});

describe('placeCity', () => {
  it('keeps a locality in the address when it becomes the city', () => {
    expect(placeCity('Peelamedu', 'Avinashi Road, Peelamedu')).toEqual({ city: 'Coimbatore', address: 'Avinashi Road, Peelamedu' });
    expect(placeCity('Peelamedu', 'Avinashi Road')).toEqual({ city: 'Coimbatore', address: 'Avinashi Road, Peelamedu' });
    expect(placeCity('Masakalipalayam', null)).toEqual({ city: 'Coimbatore', address: 'Masakalipalayam' });
    expect(placeCity('coimbatore', ' Sathy Road ')).toEqual({ city: 'Coimbatore', address: ' Sathy Road ' });
  });
});

describe('normalizeCity', () => {
  it('matches case, spacing and Tamil script, and leaves other places alone', () => {
    expect(normalizeCity('coimbatore')).toBe('Coimbatore');
    expect(normalizeCity(' COIMBATORE ')).toBe('Coimbatore');
    expect(normalizeCity('கோயம்புத்தூர்')).toBe('Coimbatore');
    expect(normalizeCity('chennai')).toBe('Chennai');
    expect(normalizeCity('சென்னை')).toBe('Chennai');
    expect(normalizeCity('Peelamedu')).toBe('Coimbatore');
    expect(normalizeCity('MASAKALIPALAYAM')).toBe('Coimbatore');
    expect(normalizeCity('Ganapathy')).toBe('Ganapathy');
    expect(normalizeCity('  ')).toBeNull();
    expect(normalizeCity(null)).toBeNull();
  });
});

// Opt-in check against a copy of a real database:
//   FABER_DB_COPY=<path to a backup .db> npm test
// The file is copied to a temp folder first; the original is never opened for writing.
const realCopy = process.env.FABER_DB_COPY;
describe.skipIf(!realCopy)('runMigrations on a copy of a real database', () => {
  it('keeps every v1 value (cities only respelled) and moves the interim login into auth', async () => {
    const copyPath = path.join(dir, 'real-copy.db');
    fs.copyFileSync(realCopy!, copyPath);
    const real = new Database(copyPath);
    try {
      const originalTables = tables(real);
      // Only the columns that existed before, so added columns don't count as changes
      const columns = Object.fromEntries(V1_TABLES.map((t) =>
        [t, (real.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name)]));
      const snapshot = () => Object.fromEntries(V1_TABLES.map((t) => {
        const cols = columns[t].filter((c) => !(t === 'leads' && c === 'city'));
        return [t, real.prepare(`SELECT ${cols.join(', ')} FROM ${t} ORDER BY rowid`).all()];
      }));
      const cityCounts = () => real.prepare('SELECT city, COUNT(*) AS n FROM leads GROUP BY city ORDER BY n DESC').all();
      const citiesById = () => new Map((real.prepare('SELECT id, city FROM leads').all() as { id: number; city: string | null }[]).map((r) => [r.id, r.city]));

      const before = counts(real, originalTables);
      const valuesBefore = snapshot();
      const citiesBefore = cityCounts();
      const oldCities = citiesById();
      const legacyUser = originalTables.includes('settings')
        ? (real.prepare(`SELECT value FROM settings WHERE key = 'username'`).get() as { value: string } | undefined)?.value
        : undefined;

      const result = await runMigrations(real, MIGRATIONS, { backupDir: backupDir() });
      const after = counts(real, tables(real));

      console.log('[real DB copy] migrations applied:', result.applied, 'baselined:', result.baselined);
      console.log('[real DB copy] row counts before:', before);
      console.log('[real DB copy] row counts after: ', after);
      console.log('[real DB copy] lead cities before:', citiesBefore);
      console.log('[real DB copy] lead cities after: ', cityCounts());
      const chains = real.prepare(`SELECT id, name, chain_reason FROM leads WHERE is_chain = 1 ORDER BY id`).all();
      console.log(`[real DB copy] flagged as chains: ${chains.length}`, chains);

      expect(snapshot()).toEqual(valuesBefore);
      for (const [leadId, city] of citiesById()) expect(city).toBe(normalizeCity(oldCities.get(leadId)));
      if (legacyUser) {
        expect(real.prepare(`SELECT username FROM auth`).get()).toEqual({ username: legacyUser });
        expect(real.prepare(`SELECT COUNT(*) AS n FROM settings WHERE key IN ('username', 'password_hash', 'recovery_key_hash')`).get())
          .toEqual({ n: 0 });
      }
    } finally {
      real.close();
    }
  });
});
