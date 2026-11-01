import type Database from 'better-sqlite3';
import type { ExportEntity } from '../../../shared/types.ts';

// Active (non-deleted) rows only. There is deliberately no vault export.
const QUERIES: Record<ExportEntity, string> = {
  leads: `
    SELECT id, name, category, status, lost_reason, score, starred, (SELECT group_concat(value, ', ') FROM json_each(leads.tags)) AS tags, phone, owner_name, best_time, address, city,
           lat, lon, rating, review_count, website_url, website_status, social_links, enrichment_status, source, osm_id,
           CASE WHEN is_chain = 1 THEN chain_reason ELSE '' END AS chain, notes, discovered_at, enriched_at,
           last_contacted_at, last_updated
    FROM leads WHERE deleted_at IS NULL /*ids*/
    ORDER BY CASE WHEN score IS NULL THEN 1 ELSE 0 END, score DESC`,
  projects: `
    SELECT id, name, category, stage, phone, address, city, scope, payment_agreed, payment_received,
           deadline, delivered_at, notes, created_at, last_updated
    FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC`,
  payments: `
    SELECT p.id, pr.name AS project, p.type, p.amount, p.status, p.due_date, p.received_at, p.notes
    FROM payments p JOIN projects pr ON pr.id = p.project_id
    WHERE p.deleted_at IS NULL AND pr.deleted_at IS NULL ORDER BY p.due_date`,
  reminders: `
    SELECT r.id, r.entity_type,
      CASE WHEN r.entity_type = 'lead' THEN (SELECT name FROM leads WHERE id = r.entity_id)
           ELSE (SELECT name FROM projects WHERE id = r.entity_id) END AS entity,
      r.message, r.due_date, CASE WHEN r.is_done = 1 THEN 'done' ELSE 'open' END AS state, r.created_at
    FROM reminders r WHERE r.deleted_at IS NULL ORDER BY r.due_date`,
};

// ids narrows leads to a selection (Codex bulk export); other entities always export everything
export function exportRows(db: Database.Database, entity: ExportEntity, ids?: number[]): { columns: string[]; rows: Record<string, unknown>[] } {
  const selection = entity === 'leads' && ids?.length ? ids : null;
  const sql = QUERIES[entity].replace('/*ids*/', selection ? `AND id IN (${selection.map(() => '?').join(', ')})` : '');
  const statement = db.prepare(sql);
  const columns = statement.columns().map((c) => c.name);
  return { columns, rows: statement.all(...(selection ?? [])) as Record<string, unknown>[] };
}

// Cells that a spreadsheet would run as a formula get a leading apostrophe
function cell(value: unknown): string {
  if (value == null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// UTF-8 with a BOM and CRLF line endings, so Excel opens Tamil text and ₹ correctly
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(cell).join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
