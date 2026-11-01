import type { Migration } from '../migrate.ts';

// Phase 2a schema: chain columns on leads and the editable blocklist, seeded from the brief.
// Adds the columns only; no lead is flagged here (flagging is a separate, confirmed step).
// The seed list is frozen here on purpose, like the city aliases in 005.
const SEED = [
  'Starbucks', 'Chai Kings', 'Café Coffee Day', "Domino's", 'KFC', "McDonald's", 'Subway', 'Pizza Hut',
  'Burger King', 'Naturals', 'Green Trends', 'Lakmé Salon', 'Cult.fit', "Gold's Gym", 'Anytime Fitness',
  'Adyar Ananda Bhavan', 'A2B',
];

export const chains: Migration = {
  version: 7,
  name: 'chains',
  up: (db) => {
    db.exec(`
      ALTER TABLE leads ADD COLUMN is_chain INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE leads ADD COLUMN chain_reason TEXT;
      CREATE INDEX idx_leads_is_chain ON leads(is_chain);

      CREATE TABLE chain_blocklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL UNIQUE COLLATE NOCASE,
        source TEXT NOT NULL CHECK (source IN ('seed', 'manual')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const insert = db.prepare(`INSERT INTO chain_blocklist (pattern, source) VALUES (?, 'seed')`);
    for (const pattern of SEED) insert.run(pattern);
  },
};
