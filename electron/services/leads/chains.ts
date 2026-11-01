import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { ChainPattern } from '../../../shared/types.ts';
import { chainKey, matchChain } from './chain.ts';

// The chain blocklist and lead flags (Phase 2a).
// chain_reason: 'blocklist' (name matched a pattern), 'not_a_fit' (marked by hand) or
// 'cleared' (unflagged by hand: a later pattern change never re-flags it).

// Each pattern with how many flagged leads it currently matches
export function listPatterns(db: Database.Database): ChainPattern[] {
  const rows = db.prepare(`
    SELECT id, pattern, source, created_at FROM chain_blocklist ORDER BY pattern COLLATE NOCASE
  `).all() as Omit<ChainPattern, 'matches'>[];
  const flagged = db.prepare(`SELECT name FROM leads WHERE is_chain = 1 AND chain_reason = 'blocklist' AND deleted_at IS NULL`).all() as { name: string }[];
  return rows.map((row) => ({ ...row, matches: flagged.filter((l) => matchChain(l.name ?? '', [row.pattern])).length }));
}

function patterns(db: Database.Database): string[] {
  return (db.prepare('SELECT pattern FROM chain_blocklist').all() as { pattern: string }[]).map((r) => r.pattern);
}

// Pattern a new lead's name matches, for upsertLead
export function blocklistMatch(db: Database.Database, name: string): string | null {
  return matchChain(name, patterns(db));
}

// Flags every unflagged lead the blocklist matches; returns how many were flagged
export function applyBlocklist(db: Database.Database): number {
  const list = patterns(db);
  const leads = db.prepare('SELECT id, name FROM leads WHERE is_chain = 0 AND chain_reason IS NULL').all() as { id: number; name: string }[];
  const flag = db.prepare(`UPDATE leads SET is_chain = 1, chain_reason = 'blocklist', last_updated = datetime('now') WHERE id = ?`);
  let flagged = 0;
  for (const lead of leads) {
    if (matchChain(lead.name ?? '', list)) {
      flag.run(lead.id);
      flagged++;
    }
  }
  return flagged;
}

export function addPattern(db: Database.Database, pattern: string, source: 'seed' | 'manual' = 'manual'): { flagged: number } {
  const tidy = pattern.trim().replace(/\s+/g, ' ');
  if (!chainKey(tidy)) throw new AppError('VALIDATION', 'Enter a name with at least one letter or number');
  return db.transaction(() => {
    const exists = patterns(db).some((p) => chainKey(p) === chainKey(tidy));
    if (exists) throw new AppError('CONFLICT', `"${tidy}" is already on the blocklist`);
    db.prepare('INSERT INTO chain_blocklist (pattern, source) VALUES (?, ?)').run(tidy, source);
    return { flagged: applyBlocklist(db) };
  })();
}

// Removing a pattern unflags the leads only it was holding (hand-marked ones stay)
export function removePattern(db: Database.Database, id: number): { unflagged: number } {
  return db.transaction(() => {
    const row = db.prepare('SELECT pattern FROM chain_blocklist WHERE id = ?').get(id) as { pattern: string } | undefined;
    if (!row) throw new AppError('NOT_FOUND', 'That blocklist entry no longer exists');
    db.prepare('DELETE FROM chain_blocklist WHERE id = ?').run(id);
    const list = patterns(db);
    const flagged = db.prepare(`SELECT id, name FROM leads WHERE is_chain = 1 AND chain_reason = 'blocklist'`).all() as { id: number; name: string }[];
    const unflag = db.prepare(`UPDATE leads SET is_chain = 0, chain_reason = NULL, last_updated = datetime('now') WHERE id = ?`);
    let unflagged = 0;
    for (const lead of flagged) {
      if (!matchChain(lead.name ?? '', list)) {
        unflag.run(lead.id);
        unflagged++;
      }
    }
    return { unflagged };
  })();
}

function requireLiveLead(db: Database.Database, id: number): { id: number; name: string } {
  const lead = db.prepare('SELECT id, name FROM leads WHERE id = ? AND deleted_at IS NULL').get(id) as { id: number; name: string } | undefined;
  if (!lead) throw new AppError('NOT_FOUND', `Lead ${id} not found`);
  return lead;
}

// "Mark not a fit": flags the lead; optionally adds its name to the blocklist, which also
// flags other leads with that name. One transaction.
export function markNotAFit(db: Database.Database, id: number, addToBlocklist: boolean): { alsoFlagged: number } {
  return db.transaction(() => {
    const lead = requireLiveLead(db, id);
    db.prepare(`UPDATE leads SET is_chain = 1, chain_reason = 'not_a_fit', last_updated = datetime('now') WHERE id = ?`).run(id);
    if (!addToBlocklist) return { alsoFlagged: 0 };
    const name = lead.name.trim().replace(/\s+/g, ' ');
    if (!chainKey(name)) return { alsoFlagged: 0 };
    if (!patterns(db).some((p) => chainKey(p) === chainKey(name))) {
      db.prepare(`INSERT INTO chain_blocklist (pattern, source) VALUES (?, 'manual')`).run(name);
    }
    return { alsoFlagged: applyBlocklist(db) };
  })();
}

// Undo for any flag (false positive or a not-a-fit change of mind)
export function unflagLead(db: Database.Database, id: number) {
  requireLiveLead(db, id);
  db.prepare(`UPDATE leads SET is_chain = 0, chain_reason = 'cleared', last_updated = datetime('now') WHERE id = ?`).run(id);
}
