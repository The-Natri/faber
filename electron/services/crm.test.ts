import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../db/migrate.ts';
import { MIGRATIONS } from '../db/migrations/index.ts';
import { listLeads as listLeadsWith, moveLead, softDeleteLead, upsertLead, type NewLead } from './leads/index.ts';
import { DEFAULT_LEAD_FILTERS, type LeadFilters } from '../../shared/types.ts';
import { addWorkLog, createProject, listProjects, softDeleteProject } from './projects/index.ts';
import { createPayment, listPayments, markPaymentReceived, softDeletePayment } from './payments/index.ts';
import { createReminder, listReminders, reminderEntities, softDeleteReminder } from './reminders/index.ts';
import { getDashboard } from './dashboard/index.ts';
import { listTrash, purgeExpired, purgeItem, restoreItem } from './trash/index.ts';
import { search } from './search/index.ts';
import { exportRows, toCsv } from './export/index.ts';

let dir: string;
let db: Database.Database;
const listLeads = (d: Database.Database, filters: Partial<LeadFilters> = {}) => listLeadsWith(d, { ...DEFAULT_LEAD_FILTERS, ...filters });

const lead = (osmId: string, name: string, extra: Partial<NewLead> = {}): NewLead => ({
  osm_id: osmId, name, category: 'Cafes', source: 'osm', phone: null, address: null,
  city: 'Coimbatore', lat: 11, lon: 77, rating: null, ...extra,
});
const received = (projectId: number) =>
  (db.prepare('SELECT payment_received FROM projects WHERE id = ?').get(projectId) as { payment_received: number }).payment_received;
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
// Makes every write to `table` fail, to prove a transaction leaves nothing half-done
const breakWrites = (table: string, op: 'UPDATE' | 'DELETE' | 'INSERT') =>
  db.exec(`CREATE TRIGGER broken BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-crm-'));
  db = new Database(path.join(dir, 'faber.db'));
  db.pragma('foreign_keys = ON');
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('leads', () => {
  it('upserts by OSM id without duplicating and normalizes the city', () => {
    expect(upsertLead(db, lead('node/1', 'Cafe One', { city: 'coimbatore', phone: '123' }))).toBe('inserted');
    expect(upsertLead(db, lead('node/1', 'Cafe One', { phone: '456' }))).toBe('updated');
    const [only] = listLeads(db);
    expect(listLeads(db)).toHaveLength(1);
    expect(only).toMatchObject({ city: 'Coimbatore', phone: '456', has_phone: 1, status: 'new', enrichment_status: 'pending' });
  });

  it('converts a won lead into a project atomically and keeps the lead', () => {
    upsertLead(db, lead('node/1', 'Cafe One'));
    const [{ id }] = listLeads(db);

    breakWrites('leads', 'UPDATE');
    expect(() => moveLead(db, id, 'won')).toThrow('forced failure');
    expect(count('projects')).toBe(0);
    expect(count('lead_activity')).toBe(0);
    expect(listLeads(db)).toHaveLength(1);

    db.exec('DROP TRIGGER broken');
    const { project_id } = moveLead(db, id, 'won');
    expect(listLeads(db)).toHaveLength(0);
    expect(listLeads(db, { stages: ['won'] })).toMatchObject([{ id, status: 'won' }]);
    expect(listProjects(db)[0]).toMatchObject({ id: project_id, name: 'Cafe One', stage: 'ongoing', payment_received: 0 });
    expect(db.prepare('SELECT lead_id FROM projects WHERE id = ?').get(project_id)).toEqual({ lead_id: id });
  });
});

describe('payments', () => {
  let projectId: number;
  beforeEach(() => {
    projectId = createProject(db, { name: 'Sample Project', payment_agreed: 10000 }).id;
  });

  it('counts a milestone created as received, in one transaction', () => {
    createPayment(db, { project_id: projectId, amount: 4000, type: 'advance', status: 'received' });
    expect(received(projectId)).toBe(4000);

    breakWrites('projects', 'UPDATE');
    expect(() => createPayment(db, { project_id: projectId, amount: 2000, type: 'milestone', status: 'received' })).toThrow('forced failure');
    expect(count('payments')).toBe(1);
  });

  it('marks received once, using the stored amount', () => {
    const payment = createPayment(db, { project_id: projectId, amount: 3000, type: 'milestone', status: 'pending' });
    breakWrites('projects', 'UPDATE');
    expect(() => markPaymentReceived(db, payment.id)).toThrow('forced failure');
    expect(listPayments(db).payments[0].status).toBe('pending');

    db.exec('DROP TRIGGER broken');
    markPaymentReceived(db, payment.id);
    expect(received(projectId)).toBe(3000);
    expect(() => markPaymentReceived(db, payment.id)).toThrow(/already/);
    expect(received(projectId)).toBe(3000);
  });

  it('soft-deletes a received milestone (subtracting it) and restores it (adding it back)', () => {
    const payment = createPayment(db, { project_id: projectId, amount: 4000, type: 'advance', status: 'received' });

    breakWrites('projects', 'UPDATE');
    expect(() => softDeletePayment(db, payment.id)).toThrow('forced failure');
    expect(listPayments(db).payments).toHaveLength(1);
    db.exec('DROP TRIGGER broken');

    softDeletePayment(db, payment.id);
    expect(received(projectId)).toBe(0);
    expect(listPayments(db).payments).toHaveLength(0);

    restoreItem(db, 'payment', payment.id);
    expect(received(projectId)).toBe(4000);
    expect(listPayments(db).payments).toHaveLength(1);
  });
});

describe('trash', () => {
  it('hides deleted items everywhere, lists them, and restores them', () => {
    upsertLead(db, lead('node/1', 'Cafe One'));
    upsertLead(db, lead('node/2', 'Salon Two'));
    const [first] = listLeads(db);
    const projectId = createProject(db, { name: 'Sample Project', payment_agreed: 10000 }).id;
    const reminder = createReminder(db, { entity_type: 'lead', entity_id: first.id, message: 'Call back', due_date: '2026-10-20' });

    softDeleteLead(db, first.id);
    softDeleteProject(db, projectId);
    softDeleteReminder(db, reminder.id);

    expect(listLeads(db).map((l) => l.name)).toEqual(['Salon Two']);
    expect(listProjects(db)).toHaveLength(0);
    expect(listReminders(db)).toHaveLength(0);
    expect(reminderEntities(db)).toEqual({ leads: [{ id: expect.any(Number), name: 'Salon Two' }], projects: [] });
    expect(getDashboard(db)).toMatchObject({ leadStats: { total: 1 }, projectCount: 0, revenueStats: { total_agreed: 0 } });
    expect(search(db, 'Cafe')).toEqual([]);

    expect(listTrash(db).map((t) => [t.type, t.days_left])).toEqual(
      expect.arrayContaining([['lead', 30], ['project', 30], ['reminder', 30]]));

    restoreItem(db, 'lead', first.id);
    expect(listLeads(db)).toHaveLength(2);
    expect(() => restoreItem(db, 'lead', first.id)).toThrow(/not in the trash/);
  });

  it('deletes a project forever with its work log, payments and reminders — or not at all', () => {
    const projectId = createProject(db, { name: 'Sample Project' }).id;
    addWorkLog(db, projectId, 'Kickoff');
    createPayment(db, { project_id: projectId, amount: 4000, type: 'advance', status: 'received' });
    createReminder(db, { entity_type: 'project', entity_id: projectId, message: 'Renew domain', due_date: '2026-11-01' });
    softDeleteProject(db, projectId);

    breakWrites('payments', 'DELETE');
    expect(() => purgeItem(db, 'project', projectId)).toThrow('forced failure');
    expect([count('projects'), count('work_log'), count('payments'), count('reminders')]).toEqual([1, 1, 1, 1]);

    db.exec('DROP TRIGGER broken');
    purgeItem(db, 'project', projectId);
    expect([count('projects'), count('work_log'), count('payments'), count('reminders')]).toEqual([0, 0, 0, 0]);
  });

  it('auto-purges only items deleted 30 or more days ago', () => {
    upsertLead(db, lead('node/1', 'Old'));
    upsertLead(db, lead('node/2', 'Recent'));
    db.prepare(`UPDATE leads SET deleted_at = datetime('now', '-31 days') WHERE name = 'Old'`).run();
    db.prepare(`UPDATE leads SET deleted_at = datetime('now', '-29 days') WHERE name = 'Recent'`).run();

    expect(purgeExpired(db)).toBe(1);
    expect(listTrash(db).map((t) => [t.title, t.days_left])).toEqual([['Recent', 1]]);
  });
});

describe('search and export', () => {
  it('treats % and _ literally', () => {
    upsertLead(db, lead('node/1', '100% Juice'));
    upsertLead(db, lead('node/2', 'Juice Bar'));
    expect(search(db, '100%').map((h) => h.title)).toEqual(['100% Juice']);
    expect(search(db, '  ')).toEqual([]);
  });

  it('writes Excel-safe CSV', () => {
    const csv = toCsv(['name', 'note', 'amount'], [
      { name: 'Café, "Kovai"', note: '=HYPERLINK("x")', amount: -500 },
      { name: 'கோவை', note: null, amount: 0 },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')).toEqual([
      '﻿name,note,amount',
      '"Café, ""Kovai""","\'=HYPERLINK(""x"")",-500',
      'கோவை,,0',
      '',
    ]);
  });

  it('exports active rows only', () => {
    upsertLead(db, lead('node/1', 'Kept'));
    upsertLead(db, lead('node/2', 'Gone'));
    softDeleteLead(db, listLeads(db).find((l) => l.name === 'Gone')!.id);
    const { columns, rows } = exportRows(db, 'leads');
    expect(columns).toContain('name');
    expect(rows.map((r) => r.name)).toEqual(['Kept']);
  });
});
