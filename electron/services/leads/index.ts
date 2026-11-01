import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import { ACTIVE_STAGES, asStatus, canMove, LOST_REASON_LABEL, STAGE_LABEL, type LeadStatus, type LostReason } from '../../../shared/pipeline.ts';
import type { BulkLeadAction, BulkResult, Lead, LeadActivity, LeadFacets, LeadFilters, LeadInput } from '../../../shared/types.ts';
import { createReminder } from '../reminders/index.ts';
import { normalizeCity, placeCity } from './city.ts';
import { blocklistMatch } from './chains.ts';

export interface NewLead {
  osm_id: string;
  name: string;
  category: string;
  source: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  lat: number;
  lon: number;
  rating: number | null;
}

type LeadRow = Omit<Lead, 'tags' | 'status'> & { tags: string | null; status: string | null };

function parseTags(json: string | null): string[] {
  try {
    const value: unknown = JSON.parse(json ?? '[]');
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function rowToLead(row: LeadRow): Lead {
  return { ...row, status: asStatus(row.status), tags: parseTags(row.tags) };
}

// Status as stored by v1 can be empty; SQL treats that as new, like asStatus()
const STATUS_SQL = `COALESCE(NULLIF(status, ''), 'new')`;

const SORT_SQL: Record<LeadFilters['sort'], string> = {
  score: 'CASE WHEN score IS NULL THEN 1 ELSE 0 END, score DESC, name COLLATE NOCASE',
  name: 'name COLLATE NOCASE, id',
  newest: 'discovered_at DESC, id DESC',
  last_contacted: 'CASE WHEN last_contacted_at IS NULL THEN 1 ELSE 0 END, last_contacted_at DESC, name COLLATE NOCASE',
};

const likeTerm = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Filtering and sorting stay in SQL (§8.1). Chains are hidden unless asked for.
export function listLeads(db: Database.Database, filters: LeadFilters): Lead[] {
  const where = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const stages = filters.stages.length ? filters.stages : ACTIVE_STAGES;
  where.push(`${STATUS_SQL} IN (${stages.map(() => '?').join(', ')})`);
  params.push(...stages);
  if (!filters.showChains) where.push('is_chain = 0');
  const term = filters.search.trim();
  if (term) {
    where.push(`(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR owner_name LIKE ? ESCAPE '\\')`);
    params.push(likeTerm(term), likeTerm(term), likeTerm(term));
  }
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.city) {
    where.push('city = ?');
    params.push(filters.city);
  }
  if (filters.scoreMin > 0 || filters.scoreMax < 100) {
    where.push('score IS NOT NULL AND score >= ? AND score <= ?');
    params.push(filters.scoreMin, filters.scoreMax);
  }
  for (const tag of filters.tags) {
    where.push('EXISTS (SELECT 1 FROM json_each(leads.tags) WHERE value = ?)');
    params.push(tag);
  }
  if (filters.starredOnly) where.push('starred = 1');
  if (filters.websiteStatus) {
    where.push('website_status = ?');
    params.push(filters.websiteStatus);
  }
  const rows = db.prepare(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY ${SORT_SQL[filters.sort]}`).all(...params) as LeadRow[];
  return rows.map(rowToLead);
}

// Choices for the city and tag filters, from live leads
export function leadFacets(db: Database.Database): LeadFacets {
  const cities = (db.prepare(`SELECT DISTINCT city FROM leads WHERE deleted_at IS NULL AND city IS NOT NULL AND city != '' ORDER BY city COLLATE NOCASE`).all() as { city: string }[]).map((r) => r.city);
  const tags = (db.prepare(`
    SELECT DISTINCT t.value AS tag FROM leads, json_each(leads.tags) t
    WHERE leads.deleted_at IS NULL ORDER BY t.value COLLATE NOCASE
  `).all() as { tag: string }[]).map((r) => r.tag);
  return { cities, tags };
}

function requireLead(db: Database.Database, id: number): Lead {
  const row = db.prepare('SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL').get(id) as LeadRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', `Lead ${id} not found`);
  return rowToLead(row);
}

export function getLead(db: Database.Database, id: number): Lead {
  return requireLead(db, id);
}

function addActivity(db: Database.Database, leadId: number, type: LeadActivity['type'], fields: { channel?: LeadActivity['channel']; outcome?: string | null; body?: string | null } = {}) {
  db.prepare('INSERT INTO lead_activity (lead_id, type, channel, outcome, body) VALUES (?, ?, ?, ?, ?)')
    .run(leadId, type, fields.channel ?? null, fields.outcome ?? null, fields.body ?? null);
}

export function leadActivity(db: Database.Database, id: number): LeadActivity[] {
  requireLead(db, id);
  return db.prepare('SELECT * FROM lead_activity WHERE lead_id = ? ORDER BY created_at DESC, id DESC').all(id) as LeadActivity[];
}

// Upsert by OSM id, never duplicate. A rediscovered lead only refreshes phone and address
// (and stays in the trash if it was deleted).
export function upsertLead(db: Database.Database, lead: NewLead): 'inserted' | 'updated' {
  const existing = db.prepare('SELECT id FROM leads WHERE osm_id = ?').get(lead.osm_id) as { id: number } | undefined;
  const place = placeCity(lead.city, lead.address);
  const chain = blocklistMatch(db, lead.name);
  if (existing) {
    db.prepare(`UPDATE leads SET phone = ?, address = ?, last_updated = datetime('now') WHERE osm_id = ?`)
      .run(lead.phone, place.address, lead.osm_id);
    return 'updated';
  }
  db.prepare(`
    INSERT INTO leads (osm_id, name, category, source, phone, address, city, lat, lon, rating,
                       has_phone, has_social, enrichment_status, status, is_chain, chain_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', 'new', ?, ?)
  `).run(lead.osm_id, lead.name, lead.category, lead.source, lead.phone, place.address,
    place.city, lead.lat, lead.lon, lead.rating, lead.phone ? 1 : 0, chain ? 1 : 0, chain ? 'blocklist' : null);
  return 'inserted';
}

// ── Manual add and edit (§7.5) ─────────────────────────────────────────────

const blankToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

// A hand-added lead: source manual, no map position until it's enriched or edited later.
// Enrichment can still find it on Google Maps by name. Blocklisted names are still flagged.
export function createLead(db: Database.Database, input: LeadInput): { lead: Lead; flaggedAsChain: boolean } {
  const name = input.name.trim();
  const chain = blocklistMatch(db, name);
  const phone = blankToNull(input.phone);
  const result = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO leads (name, category, source, phone, address, city, owner_name, best_time, website_url, notes,
                         has_phone, enrichment_status, status, is_chain, chain_reason)
      VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'new', ?, ?)
    `).run(name, blankToNull(input.category), phone, blankToNull(input.address), normalizeCity(input.city),
      blankToNull(input.owner_name), blankToNull(input.best_time), blankToNull(input.website_url), blankToNull(input.notes),
      phone ? 1 : 0, chain ? 1 : 0, chain ? 'blocklist' : null);
    const id = Number(inserted.lastInsertRowid);
    addActivity(db, id, 'note', { body: 'Added by hand' });
    return id;
  })();
  return { lead: requireLead(db, result), flaggedAsChain: chain !== null };
}

export function updateLead(db: Database.Database, id: number, input: LeadInput): Lead {
  requireLead(db, id);
  const phone = blankToNull(input.phone);
  db.prepare(`
    UPDATE leads SET name = ?, category = ?, phone = ?, has_phone = ?, address = ?, city = ?, owner_name = ?,
      best_time = ?, website_url = ?, notes = ?, last_updated = datetime('now')
    WHERE id = ?
  `).run(input.name.trim(), blankToNull(input.category), phone, phone ? 1 : 0, blankToNull(input.address),
    normalizeCity(input.city), blankToNull(input.owner_name), blankToNull(input.best_time),
    blankToNull(input.website_url), blankToNull(input.notes), id);
  return requireLead(db, id);
}

export function updateLeadNotes(db: Database.Database, id: number, notes: string) {
  requireLead(db, id);
  db.prepare(`UPDATE leads SET notes = ?, last_updated = datetime('now') WHERE id = ?`).run(notes, id);
}

export function setStarred(db: Database.Database, id: number, starred: boolean) {
  requireLead(db, id);
  db.prepare(`UPDATE leads SET starred = ?, last_updated = datetime('now') WHERE id = ?`).run(starred ? 1 : 0, id);
}

const tidyTag = (tag: string) => tag.trim().replace(/\s+/g, ' ').slice(0, 30);

export function setTags(db: Database.Database, id: number, tags: string[]) {
  requireLead(db, id);
  const unique: string[] = [];
  for (const tag of tags.map(tidyTag).filter(Boolean)) {
    if (!unique.some((t) => t.toLowerCase() === tag.toLowerCase())) unique.push(tag);
  }
  db.prepare(`UPDATE leads SET tags = ?, last_updated = datetime('now') WHERE id = ?`).run(JSON.stringify(unique), id);
}

// ── Pipeline moves (§8.1) ─────────────────────────────────────────────────

export interface MoveOptions {
  lostReason?: LostReason;
  note?: string;
}

// One move, validated against the pipeline rules and logged on the timeline. Won converts the
// lead into a project (lead kept, linked by projects.lead_id), all in one transaction.
export function moveLead(db: Database.Database, id: number, to: LeadStatus, options: MoveOptions = {}): { project_id: number | null } {
  return db.transaction(() => {
    const lead = requireLead(db, id);
    const from = lead.status;
    if (!canMove(from, to)) {
      throw new AppError('CONFLICT', from === 'won'
        ? `${lead.name} is already won; it lives on as a project in Forge`
        : `${lead.name} can't move from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}`);
    }
    const note = options.note?.trim() || null;
    let projectId: number | null = null;

    if (to === 'lost') {
      if (!options.lostReason) throw new AppError('VALIDATION', 'Choose why this lead was lost');
      if (options.lostReason === 'other' && !note) throw new AppError('VALIDATION', 'Add a short note for "Other"');
      db.prepare(`UPDATE leads SET status = 'lost', lost_reason = ?, last_updated = datetime('now') WHERE id = ?`).run(options.lostReason, id);
    } else if (to === 'won') {
      const project = db.prepare(`
        INSERT INTO projects (name, category, phone, address, city, source, social_links, lead_id, stage, payment_received)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ongoing', 0)
      `).run(lead.name, lead.category, lead.phone, lead.address, lead.city, lead.source, lead.social_links, id);
      projectId = Number(project.lastInsertRowid);
      db.prepare(`UPDATE leads SET status = 'won', last_updated = datetime('now') WHERE id = ?`).run(id);
      // Phase 2e: pending auto follow-ups for this lead are cancelled here
    } else {
      db.prepare(`
        UPDATE leads SET status = ?, lost_reason = NULL,
          last_contacted_at = CASE WHEN ? = 'contacted' THEN datetime('now') ELSE last_contacted_at END,
          last_updated = datetime('now')
        WHERE id = ?
      `).run(to, to, id);
    }

    const reason = to === 'lost' && options.lostReason ? LOST_REASON_LABEL[options.lostReason] : null;
    addActivity(db, id, 'status_change', {
      outcome: `${from}→${to}`,
      body: [reason, note].filter(Boolean).join(': ') || null,
    });
    return { project_id: projectId };
  })();
}

export function softDeleteLead(db: Database.Database, id: number) {
  requireLead(db, id);
  db.prepare(`UPDATE leads SET deleted_at = datetime('now') WHERE id = ?`).run(id);
}

// ── Bulk actions (§7.5); one transaction, skipped leads reported ──────────

export function bulkLeads(db: Database.Database, ids: number[], action: BulkLeadAction): BulkResult {
  return db.transaction(() => {
    const result: BulkResult = { done: 0, skipped: [] };
    for (const id of [...new Set(ids)]) {
      const row = db.prepare('SELECT id, name, deleted_at, status, tags FROM leads WHERE id = ?').get(id) as
        { id: number; name: string; deleted_at: string | null; status: string | null; tags: string | null } | undefined;
      if (!row) {
        result.skipped.push({ id, name: `Lead ${id}`, reason: 'No longer exists' });
        continue;
      }
      if (action.type === 'restore') {
        if (row.deleted_at) {
          db.prepare('UPDATE leads SET deleted_at = NULL WHERE id = ?').run(id);
          result.done++;
        }
        continue;
      }
      if (row.deleted_at) {
        result.skipped.push({ id, name: row.name, reason: 'In the trash' });
        continue;
      }
      switch (action.type) {
        case 'move': {
          const from = asStatus(row.status);
          if (!canMove(from, action.to)) {
            result.skipped.push({ id, name: row.name, reason: `Can't move from ${STAGE_LABEL[from]} to ${STAGE_LABEL[action.to]}` });
            continue;
          }
          moveLead(db, id, action.to, { lostReason: action.lostReason, note: action.note });
          break;
        }
        case 'tag': {
          const tags = parseTags(row.tags);
          const tag = tidyTag(action.tag);
          const has = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
          if (action.add === has) {
            result.skipped.push({ id, name: row.name, reason: action.add ? 'Already tagged' : 'Not tagged' });
            continue;
          }
          setTags(db, id, action.add ? [...tags, tag] : tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
          break;
        }
        case 'star':
          setStarred(db, id, action.starred);
          break;
        case 'followUp':
          createReminder(db, { entity_type: 'lead', entity_id: id, message: action.message, due_date: action.dueDate });
          break;
        case 'delete':
          softDeleteLead(db, id);
          break;
      }
      result.done++;
    }
    return result;
  })();
}

export function pendingEnrichmentBatch(db: Database.Database, limit: number): Lead[] {
  const rows = db.prepare(`SELECT * FROM leads WHERE enrichment_status = 'pending' AND deleted_at IS NULL AND is_chain = 0 LIMIT ?`).all(limit) as LeadRow[];
  return rows.map(rowToLead);
}
