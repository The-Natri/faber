import type { Migration } from '../migrate.ts';

// Leads whose city came in as a Coimbatore locality get city = Coimbatore; the locality is kept
// in the address (appended only if the address doesn't already mention it). Frozen list, like 005.
const LOCALITIES: Record<string, string> = {
  peelamedu: 'Coimbatore',
  masakalipalayam: 'Coimbatore',
};

export const localityCities: Migration = {
  version: 6,
  name: 'locality_cities',
  up: (db) => {
    const rows = db.prepare('SELECT id, city, address FROM leads WHERE city IS NOT NULL').all() as { id: number; city: string; address: string | null }[];
    const update = db.prepare('UPDATE leads SET city = ?, address = ? WHERE id = ?');
    for (const { id, city, address } of rows) {
      const locality = city.normalize('NFC').trim().replace(/\s+/g, ' ');
      const canonical = LOCALITIES[locality.toLocaleLowerCase('en')];
      if (!canonical) continue;
      const addr = address?.trim() || null;
      const keeps = addr != null && addr.toLocaleLowerCase('en').includes(locality.toLocaleLowerCase('en'));
      update.run(canonical, keeps ? address : addr ? `${addr}, ${locality}` : locality, id);
    }
  },
};
