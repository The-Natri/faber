import type { Migration } from '../migrate.ts';

// Folds the city spellings in existing leads to Coimbatore / Chennai. The alias list is frozen
// here on purpose: services/leads/city.ts may grow, but this migration must always do the same thing.
const ALIASES: Record<string, string> = {
  coimbatore: 'Coimbatore',
  'கோயம்புத்தூர்': 'Coimbatore',
  chennai: 'Chennai',
  'சென்னை': 'Chennai',
};

export const normalizeCities: Migration = {
  version: 5,
  name: 'normalize_cities',
  up: (db) => {
    const rows = db.prepare('SELECT id, city FROM leads WHERE city IS NOT NULL').all() as { id: number; city: string }[];
    const update = db.prepare('UPDATE leads SET city = ? WHERE id = ?');
    for (const { id, city } of rows) {
      const canonical = ALIASES[city.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')];
      if (canonical && canonical !== city) update.run(canonical, id);
    }
  },
};
