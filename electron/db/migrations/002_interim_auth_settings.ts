import type { Migration } from '../migrate.ts';

// The interim password-reset table (shipped after v1.0.0). Installs that already ran the
// interim build have it, hence IF NOT EXISTS. Phase 1 moves its rows into the `auth` table.
export const interimAuthSettings: Migration = {
  version: 2,
  name: 'interim_auth_settings',
  up: (db) => db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `),
};
