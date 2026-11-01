import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import {
  bulkLeads, createLead, getLead, leadActivity, leadFacets, listLeads, moveLead, setStarred, setTags, updateLead, upsertLead,
} from './index.ts';
import { allowedMoves, canMove } from '../../../shared/pipeline.ts';
import { DEFAULT_LEAD_FILTERS, type LeadFilters, type LeadInput } from '../../../shared/types.ts';
import { exportRows } from '../export/index.ts';
import { listReminders } from '../reminders/index.ts';

let dir: string;
let db: Database.Database;

const insert = (osmId: string, name: string, extra: { city?: string; category?: string; score?: number } = {}) => {
  upsertLead(db, { osm_id: osmId, name, category: extra.category ?? 'Cafes', source: 'osm', phone: null, address: null, city: extra.city ?? 'Coimbatore', lat: 11, lon: 77, rating: null });
  const { id } = db.prepare('SELECT id FROM leads WHERE osm_id = ?').get(osmId) as { id: number };
  if (extra.score != null) db.prepare('UPDATE leads SET score = ? WHERE id = ?').run(extra.score, id);
  return id;
};
const list = (filters: Partial<LeadFilters> = {}) => listLeads(db, { ...DEFAULT_LEAD_FILTERS, ...filters }).map((l) => l.name);
const input = (values: Partial<LeadInput>): LeadInput => ({
  name: '', category: null, phone: null, address: null, city: null, owner_name: null, best_time: null, website_url: null, notes: null, ...values,
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-pipeline-'));
  db = new Database(path.join(dir, 'faber.db'));
  db.pragma('foreign_keys = ON');
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('pipeline rules', () => {
  it('allows forward any steps, back one step, lost from any active stage, and reopen', () => {
    expect(canMove('new', 'proposal')).toBe(true);
    expect(canMove('new', 'won')).toBe(true);
    expect(canMove('meeting', 'replied')).toBe(true);
    expect(canMove('meeting', 'contacted')).toBe(false);
    expect(canMove('replied', 'lost')).toBe(true);
    expect(canMove('lost', 'new')).toBe(true);
    expect(canMove('lost', 'contacted')).toBe(false);
    expect(allowedMoves('won')).toEqual([]);
    expect(allowedMoves('contacted')).toEqual(['new', 'replied', 'meeting', 'proposal', 'won', 'lost']);
  });

  it('logs every move on the timeline and records lost reasons', () => {
    const id = insert('node/1', 'Cafe One');
    moveLead(db, id, 'contacted');
    moveLead(db, id, 'meeting');
    expect(getLead(db, id).last_contacted_at).not.toBeNull();
    expect(() => moveLead(db, id, 'lost')).toThrow(/why this lead was lost/);
    expect(() => moveLead(db, id, 'lost', { lostReason: 'other' })).toThrow(/note/);
    moveLead(db, id, 'lost', { lostReason: 'has_website', note: 'Built by a cousin' });
    expect(getLead(db, id)).toMatchObject({ status: 'lost', lost_reason: 'has_website' });
    expect(() => moveLead(db, id, 'meeting')).toThrow(/can't move from Lost to Meeting/);
    moveLead(db, id, 'new');
    expect(getLead(db, id)).toMatchObject({ status: 'new', lost_reason: null });
    expect(leadActivity(db, id).map((a) => [a.type, a.outcome, a.body])).toEqual([
      ['status_change', 'lost→new', null],
      ['status_change', 'meeting→lost', 'Already has a website: Built by a cousin'],
      ['status_change', 'contacted→meeting', null],
      ['status_change', 'new→contacted', null],
    ]);
  });

  it('won is final', () => {
    const id = insert('node/1', 'Cafe One');
    moveLead(db, id, 'won');
    expect(() => moveLead(db, id, 'proposal')).toThrow(/already won/);
  });
});

describe('filters and sorting (SQL)', () => {
  beforeEach(() => {
    const a = insert('node/1', 'Alpha Cafe', { score: 80, city: 'Chennai' });
    const b = insert('node/2', 'Beta Salon', { score: 45, category: 'Salons' });
    insert('node/3', 'Gamma Gym', { category: 'Gyms' });
    const d = insert('node/4', 'Delta Diner', { score: 20 });
    moveLead(db, d, 'lost', { lostReason: 'no_budget' });
    setTags(db, a, ['vip', ' Hot  lead ', 'VIP']);
    setTags(db, b, ['hot lead']);
    setStarred(db, b, true);
  });

  it('shows active stages by default, sorted by score', () => {
    expect(list()).toEqual(['Alpha Cafe', 'Beta Salon', 'Gamma Gym']);
    expect(list({ stages: ['lost'] })).toEqual(['Delta Diner']);
    expect(list({ sort: 'name' })).toEqual(['Alpha Cafe', 'Beta Salon', 'Gamma Gym']);
  });

  it('filters by search, category, city, score range, tags and starred', () => {
    expect(list({ search: 'sal' })).toEqual(['Beta Salon']);
    expect(list({ search: '%' })).toEqual([]);
    expect(list({ category: 'Gyms' })).toEqual(['Gamma Gym']);
    expect(list({ city: 'Chennai' })).toEqual(['Alpha Cafe']);
    expect(list({ scoreMin: 40, scoreMax: 70 })).toEqual(['Beta Salon']);
    expect(list({ tags: ['Hot lead'] })).toEqual(['Alpha Cafe']);
    expect(list({ starredOnly: true })).toEqual(['Beta Salon']);
    expect(list({ websiteStatus: 'unknown' })).toHaveLength(3);
  });

  it('dedupes tags case-insensitively and lists facets', () => {
    expect(listLeads(db, DEFAULT_LEAD_FILTERS)[0].tags).toEqual(['vip', 'Hot lead']);
    expect(leadFacets(db)).toEqual({ cities: ['Chennai', 'Coimbatore'], tags: ['Hot lead', 'hot lead', 'vip'] });
  });
});

describe('manual leads', () => {
  it('adds and edits a lead by hand', () => {
    const { lead, flaggedAsChain } = createLead(db, input({ name: ' Walk-in Bakery ', phone: ' 98765 43210 ', city: 'coimbatore', owner_name: 'Ravi' }));
    expect(flaggedAsChain).toBe(false);
    expect(lead).toMatchObject({ name: 'Walk-in Bakery', source: 'manual', osm_id: null, phone: '98765 43210', has_phone: 1, city: 'Coimbatore', owner_name: 'Ravi', status: 'new', lat: null });
    expect(leadActivity(db, lead.id)[0]).toMatchObject({ type: 'note', body: 'Added by hand' });
    const edited = updateLead(db, lead.id, input({ name: 'Walk-in Bakery & Cafe', phone: '', best_time: 'After 4 pm' }));
    expect(edited).toMatchObject({ name: 'Walk-in Bakery & Cafe', phone: null, has_phone: 0, best_time: 'After 4 pm', owner_name: null });
  });

  it('flags a hand-added chain', () => {
    expect(createLead(db, input({ name: 'KFC Avinashi Road' })).flaggedAsChain).toBe(true);
  });
});

describe('bulk actions', () => {
  it('applies one action to many leads in a transaction and reports skips', () => {
    const a = insert('node/1', 'A');
    const b = insert('node/2', 'B');
    const c = insert('node/3', 'C');
    moveLead(db, c, 'meeting');

    expect(bulkLeads(db, [a, b, c], { type: 'move', to: 'contacted' })).toEqual({
      done: 2, skipped: [{ id: c, name: 'C', reason: "Can't move from Meeting to Contacted" }],
    });
    expect(bulkLeads(db, [a, b], { type: 'tag', tag: 'Visit', add: true }).done).toBe(2);
    expect(bulkLeads(db, [a], { type: 'tag', tag: 'visit', add: true }).skipped[0].reason).toBe('Already tagged');
    expect(bulkLeads(db, [a, b], { type: 'star', starred: true }).done).toBe(2);
    expect(bulkLeads(db, [a, b], { type: 'followUp', dueDate: '2026-11-01', message: 'Call back' }).done).toBe(2);
    expect(listReminders(db).filter((r) => r.message === 'Call back')).toHaveLength(2);
    expect(bulkLeads(db, [a, b], { type: 'move', to: 'lost', lostReason: 'no_response' }).done).toBe(2);

    expect(bulkLeads(db, [a, b, 999], { type: 'delete' })).toMatchObject({ done: 2, skipped: [{ id: 999 }] });
    expect(list({ stages: ['lost'] })).toEqual([]);
    expect(bulkLeads(db, [a, b], { type: 'restore' }).done).toBe(2);
    expect(list({ stages: ['lost'] })).toEqual(['A', 'B']);
  });

  it('rolls back the whole batch when one write fails', () => {
    const a = insert('node/1', 'A');
    const b = insert('node/2', 'B');
    db.exec(`CREATE TRIGGER broken BEFORE UPDATE OF status ON leads WHEN NEW.id = ${b} BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    expect(() => bulkLeads(db, [a, b], { type: 'move', to: 'contacted' })).toThrow('forced failure');
    expect(getLead(db, a).status).toBe('new');
    expect(leadActivity(db, a)).toHaveLength(0);
  });
});

describe('export', () => {
  it('exports only the selected leads, with tags as text', () => {
    const a = insert('node/1', 'A');
    insert('node/2', 'B');
    setTags(db, a, ['vip', 'hot']);
    const { rows } = exportRows(db, 'leads', [a]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'A', tags: 'vip, hot' });
    expect(exportRows(db, 'leads').rows).toHaveLength(2);
  });
});
