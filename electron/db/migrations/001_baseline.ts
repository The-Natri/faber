import type { Migration } from '../migrate.ts';

// The exact v1.0.0 schema (from the v1.0.0 tag). Databases created by v1 already have
// these tables, so the runner marks this migration applied without running it there.
export const V1_TABLES = ['leads', 'projects', 'payments', 'reminders', 'work_log'];

export const V1_SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  osm_id TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  source TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  lat REAL,
  lon REAL,
  rating REAL,
  review_count INTEGER,
  social_links TEXT,
  has_phone INTEGER DEFAULT 0,
  has_social INTEGER DEFAULT 0,
  enrichment_status TEXT DEFAULT 'pending',
  score REAL,
  status TEXT DEFAULT 'new',
  notes TEXT,
  scope TEXT,
  discovered_at TEXT DEFAULT (datetime('now')),
  enriched_at TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  source TEXT,
  social_links TEXT,
  scope TEXT,
  stage TEXT DEFAULT 'ongoing',
  payment_agreed REAL,
  payment_received REAL DEFAULT 0,
  deadline TEXT,
  delivered_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  received_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  due_date TEXT NOT NULL,
  is_done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  entry TEXT NOT NULL,
  logged_at TEXT DEFAULT (datetime('now'))
);
`;

export const baseline: Migration = {
  version: 1,
  name: 'baseline',
  up: (db) => db.exec(V1_SCHEMA),
};
