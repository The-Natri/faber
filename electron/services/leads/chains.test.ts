import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import { listLeads, pendingEnrichmentBatch, upsertLead, type NewLead } from './index.ts';
import { addPattern, listPatterns, markNotAFit, removePattern, unflagLead } from './chains.ts';
import { getDashboard } from '../dashboard/index.ts';
import { DEFAULT_LEAD_FILTERS } from '../../../shared/types.ts';

let dir: string;
let db: Database.Database;

const lead = (osmId: string, name: string): NewLead => ({
  osm_id: osmId, name, category: 'Cafes', source: 'osm', phone: null, address: null,
  city: 'Coimbatore', lat: 11, lon: 77, rating: null,
});
const insert = (osmId: string, name: string) => {
  upsertLead(db, lead(osmId, name));
  return (db.prepare('SELECT id FROM leads WHERE osm_id = ?').get(osmId) as { id: number }).id;
};
const flag = (id: number) => db.prepare('SELECT is_chain, chain_reason FROM leads WHERE id = ?').get(id);
const names = (showChains = false) => listLeads(db, { ...DEFAULT_LEAD_FILTERS, showChains }).map((l) => l.name);

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-chains-'));
  db = new Database(path.join(dir, 'faber.db'));
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('chain flags', () => {
  it('flags blocklisted names on insert and hides them from lists, top leads and enrichment', () => {
    const local = insert('node/1', 'Corner Cafe');
    const chain = insert('node/2', "DOMINO'S PIZZA");
    expect(flag(local)).toEqual({ is_chain: 0, chain_reason: null });
    expect(flag(chain)).toEqual({ is_chain: 1, chain_reason: 'blocklist' });
    expect(names()).toEqual(['Corner Cafe']);
    expect(names(true)).toEqual(expect.arrayContaining(['Corner Cafe', "DOMINO'S PIZZA"]));
    expect(getDashboard(db).topLeads.map((l) => l.name)).toEqual(['Corner Cafe']);
    expect(pendingEnrichmentBatch(db, 10).map((l) => l.name)).toEqual(['Corner Cafe']);
  });

  it('has the seed list plus the two misspelt Cafe Coffee Day entries', () => {
    const list = listPatterns(db);
    expect(list).toHaveLength(19);
    expect(list.filter((p) => p.source === 'manual').map((p) => p.pattern)).toEqual(['Cafe Caffee Day', 'Cafe Cofee Day']);
    const misspelt = insert('node/3', 'Cafe Cofee Day');
    expect(flag(misspelt)).toEqual({ is_chain: 1, chain_reason: 'blocklist' });
  });

  it('adding a pattern flags matches; removing it unflags only what it held', () => {
    const a = insert('node/1', 'Barbeque Nation');
    const b = insert('node/2', 'Barbeque Nation - Gandhipuram');
    const hand = insert('node/3', 'Barbeque Nation Express');
    markNotAFit(db, hand, false);

    expect(addPattern(db, '  barbeque   nation ')).toEqual({ flagged: 2 });
    expect([flag(a), flag(b)]).toEqual([{ is_chain: 1, chain_reason: 'blocklist' }, { is_chain: 1, chain_reason: 'blocklist' }]);
    expect(listPatterns(db).find((p) => p.pattern === 'barbeque nation')?.matches).toBe(2);
    expect(() => addPattern(db, 'Barbeque Nation')).toThrow(/already on the blocklist/);
    expect(() => addPattern(db, ' ... ')).toThrow(/letter or number/);

    const id = listPatterns(db).find((p) => p.pattern === 'barbeque nation')!.id;
    expect(removePattern(db, id)).toEqual({ unflagged: 2 });
    expect(flag(a)).toEqual({ is_chain: 0, chain_reason: null });
    expect(flag(hand)).toEqual({ is_chain: 1, chain_reason: 'not_a_fit' });
  });

  it('keeps a lead flagged when another pattern still matches it', () => {
    const both = insert('node/1', 'A2B Adyar Ananda Bhavan');
    const a2b = listPatterns(db).find((p) => p.pattern === 'A2B')!.id;
    expect(removePattern(db, a2b)).toEqual({ unflagged: 0 });
    expect(flag(both)).toEqual({ is_chain: 1, chain_reason: 'blocklist' });
  });

  it('mark not a fit can add the name to the blocklist and flag same-named leads', () => {
    const one = insert('node/1', 'Hot Chips');
    const two = insert('node/2', 'Hot Chips');
    const other = insert('node/3', 'Hot Chips Corner');
    expect(markNotAFit(db, one, true)).toEqual({ alsoFlagged: 2 });
    expect(flag(one)).toEqual({ is_chain: 1, chain_reason: 'not_a_fit' });
    expect(flag(two)).toEqual({ is_chain: 1, chain_reason: 'blocklist' });
    expect(flag(other)).toEqual({ is_chain: 1, chain_reason: 'blocklist' });
    expect(listPatterns(db).some((p) => p.pattern === 'Hot Chips' && p.source === 'manual')).toBe(true);
  });

  it('unflag is sticky: a later blocklist change never re-flags that lead', () => {
    const id = insert('node/1', 'Naturals Ice Cream');
    expect(flag(id)).toEqual({ is_chain: 1, chain_reason: 'blocklist' });
    unflagLead(db, id);
    expect(flag(id)).toEqual({ is_chain: 0, chain_reason: 'cleared' });
    addPattern(db, 'Naturals Ice Cream');
    expect(flag(id)).toEqual({ is_chain: 0, chain_reason: 'cleared' });
    expect(names()).toContain('Naturals Ice Cream');
  });

  it('rejects unknown and deleted leads', () => {
    const id = insert('node/1', 'Corner Cafe');
    db.prepare(`UPDATE leads SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    expect(() => markNotAFit(db, id, false)).toThrow(/not found/);
    expect(() => unflagLead(db, 999)).toThrow(/not found/);
  });
});
