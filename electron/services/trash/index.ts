import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { TrashItem, TrashType } from '../../../shared/types.ts';
import { restorePayment } from '../payments/index.ts';

export const TRASH_DAYS = 30;

const TABLE: Record<TrashType, string> = { lead: 'leads', project: 'projects', payment: 'payments', reminder: 'reminders' };

// Whole days left before auto-purge, computed in SQL from the UTC deleted_at
const DAYS_LEFT = `MAX(0, ${TRASH_DAYS} - CAST(julianday('now') - julianday(deleted_at) AS INTEGER))`;

export function listTrash(db: Database.Database): TrashItem[] {
  return db.prepare(`
    SELECT 'lead' AS type, id, name AS title, COALESCE(category, '') || CASE WHEN city IS NOT NULL THEN ' · ' || city ELSE '' END AS subtitle,
           deleted_at, ${DAYS_LEFT} AS days_left
    FROM leads WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT 'project', id, name, 'Project · ' || stage, deleted_at, ${DAYS_LEFT}
    FROM projects WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT 'payment', p.id, '₹' || p.amount || ' ' || p.type, 'Payment · ' || pr.name || ' · ' || p.status, p.deleted_at,
           MAX(0, ${TRASH_DAYS} - CAST(julianday('now') - julianday(p.deleted_at) AS INTEGER))
    FROM payments p JOIN projects pr ON pr.id = p.project_id WHERE p.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'reminder', id, message, 'Reminder · due ' || due_date, deleted_at, ${DAYS_LEFT}
    FROM reminders WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).all() as TrashItem[];
}

function requireTrashed(db: Database.Database, type: TrashType, id: number) {
  const row = db.prepare(`SELECT id FROM ${TABLE[type]} WHERE id = ? AND deleted_at IS NOT NULL`).get(id);
  if (!row) throw new AppError('NOT_FOUND', `That ${type} is not in the trash`);
}

export function restoreItem(db: Database.Database, type: TrashType, id: number) {
  if (type === 'payment') {
    restorePayment(db, id);
    return;
  }
  requireTrashed(db, type, id);
  db.prepare(`UPDATE ${TABLE[type]} SET deleted_at = NULL WHERE id = ?`).run(id);
}

// Delete forever, with every child row, in one transaction
export function purgeItem(db: Database.Database, type: TrashType, id: number) {
  db.transaction(() => {
    requireTrashed(db, type, id);
    if (type === 'lead') {
      db.prepare(`DELETE FROM reminders WHERE entity_type = 'lead' AND entity_id = ?`).run(id);
    }
    if (type === 'project') {
      db.prepare('DELETE FROM work_log WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM payments WHERE project_id = ?').run(id);
      db.prepare(`DELETE FROM reminders WHERE entity_type = 'project' AND entity_id = ?`).run(id);
    }
    db.prepare(`DELETE FROM ${TABLE[type]} WHERE id = ?`).run(id);
  })();
}

// Removes everything that has been in the trash for TRASH_DAYS or longer; returns how many went
export function purgeExpired(db: Database.Database): number {
  const expired = db.prepare(`
    SELECT type, id FROM (
      SELECT 'lead' AS type, id, deleted_at FROM leads
      UNION ALL SELECT 'project', id, deleted_at FROM projects
      UNION ALL SELECT 'payment', id, deleted_at FROM payments
      UNION ALL SELECT 'reminder', id, deleted_at FROM reminders
    ) WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now', '-${TRASH_DAYS} days')
  `).all() as { type: TrashType; id: number }[];
  let purged = 0;
  for (const item of expired) {
    // A project's purge already took its payments and reminders with it
    const stillThere = db.prepare(`SELECT id FROM ${TABLE[item.type]} WHERE id = ?`).get(item.id);
    if (!stillThere) continue;
    purgeItem(db, item.type, item.id);
    purged++;
  }
  return purged;
}
