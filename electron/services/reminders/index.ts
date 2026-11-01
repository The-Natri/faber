import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { EntityOption, EntityType, Reminder } from '../../../shared/types.ts';

export interface NewReminder {
  entity_type: EntityType;
  entity_id: number;
  message: string;
  due_date: string;
}

export const REMINDER_SELECT = `
  SELECT r.id, r.entity_type, r.entity_id, r.message, r.due_date, r.is_done, r.created_at,
    CASE
      WHEN r.entity_type = 'lead' THEN (SELECT name FROM leads WHERE id = r.entity_id)
      WHEN r.entity_type = 'project' THEN (SELECT name FROM projects WHERE id = r.entity_id)
    END AS entity_name
  FROM reminders r
`;

export function listReminders(db: Database.Database): Reminder[] {
  return db.prepare(`${REMINDER_SELECT} WHERE r.deleted_at IS NULL ORDER BY r.due_date ASC`).all() as Reminder[];
}

function requireReminder(db: Database.Database, id: number) {
  const row = db.prepare('SELECT id FROM reminders WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row) throw new AppError('NOT_FOUND', `Reminder ${id} not found`);
}

export function createReminder(db: Database.Database, data: NewReminder): Reminder {
  const table = data.entity_type === 'lead' ? 'leads' : 'projects';
  const target = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(data.entity_id);
  if (!target) throw new AppError('NOT_FOUND', `That ${data.entity_type} no longer exists`);
  const result = db.prepare('INSERT INTO reminders (entity_type, entity_id, message, due_date) VALUES (?, ?, ?, ?)')
    .run(data.entity_type, data.entity_id, data.message, data.due_date);
  return db.prepare(`${REMINDER_SELECT} WHERE r.id = ?`).get(result.lastInsertRowid) as Reminder;
}

export function markReminderDone(db: Database.Database, id: number) {
  requireReminder(db, id);
  db.prepare('UPDATE reminders SET is_done = 1 WHERE id = ?').run(id);
}

export function softDeleteReminder(db: Database.Database, id: number) {
  requireReminder(db, id);
  db.prepare(`UPDATE reminders SET deleted_at = datetime('now') WHERE id = ?`).run(id);
}

// Lost leads are excluded, as in v1
export function reminderEntities(db: Database.Database): { leads: EntityOption[]; projects: EntityOption[] } {
  const leads = db.prepare(`SELECT id, name FROM leads WHERE status != 'lost' AND deleted_at IS NULL ORDER BY name ASC`).all() as EntityOption[];
  const projects = db.prepare('SELECT id, name FROM projects WHERE deleted_at IS NULL ORDER BY name ASC').all() as EntityOption[];
  return { leads, projects };
}
