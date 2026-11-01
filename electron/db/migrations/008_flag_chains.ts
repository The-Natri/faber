import type { Migration } from '../migrate.ts';

// Phase 2a, approved by the owner on 24 Oct 2026: add the two misspelt Cafe Coffee Day names found
// in the preview as manual blocklist entries, then flag every lead whose name matches the
// blocklist (is_chain = 1, chain_reason = 'blocklist'). The matcher is a frozen copy of
// services/leads/chain.ts so this migration always does the same thing.
const MANUAL = ['Cafe Caffee Day', 'Cafe Cofee Day'];

const chainKey = (text: string) => text
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLocaleLowerCase('en')
  .replace(/['’‘`´]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export const flagChains: Migration = {
  version: 8,
  name: 'flag_chains',
  up: (db) => {
    const addManual = db.prepare(`INSERT OR IGNORE INTO chain_blocklist (pattern, source) VALUES (?, 'manual')`);
    for (const pattern of MANUAL) addManual.run(pattern);

    const needles = (db.prepare('SELECT pattern FROM chain_blocklist').all() as { pattern: string }[])
      .map((r) => chainKey(r.pattern)).filter(Boolean);
    const leads = db.prepare('SELECT id, name FROM leads WHERE is_chain = 0 AND chain_reason IS NULL').all() as { id: number; name: string | null }[];
    const flag = db.prepare(`UPDATE leads SET is_chain = 1, chain_reason = 'blocklist' WHERE id = ?`);
    for (const { id, name } of leads) {
      const haystack = ` ${chainKey(name ?? '')} `;
      if (needles.some((n) => haystack.includes(` ${n} `))) flag.run(id);
    }
  },
};
