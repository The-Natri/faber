import type Database from 'better-sqlite3';
import type { DashboardData } from '../../../shared/types.ts';
import { REMINDER_SELECT } from '../reminders/index.ts';

// Same rows as the v1 dashboard, now excluding anything in the trash
export function getDashboard(db: Database.Database): DashboardData {
  const leadStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END), 0) AS new_count,
      COALESCE(SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END), 0) AS contacted_count,
      COALESCE(SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END), 0) AS lost_count
    FROM leads WHERE deleted_at IS NULL
  `).get() as DashboardData['leadStats'];

  const projectCount = (db.prepare('SELECT COUNT(*) AS count FROM projects WHERE deleted_at IS NULL').get() as { count: number }).count;

  const topLeads = db.prepare(`
    SELECT id, name, category, score, status, city FROM leads
    WHERE status IN ('new', 'contacted') AND deleted_at IS NULL AND is_chain = 0
    ORDER BY CASE WHEN score IS NULL THEN 1 ELSE 0 END, score DESC
    LIMIT 5
  `).all() as DashboardData['topLeads'];

  const upcomingReminders = db.prepare(`${REMINDER_SELECT}
    WHERE r.is_done = 0 AND r.deleted_at IS NULL
    ORDER BY r.due_date ASC
    LIMIT 5
  `).all() as DashboardData['upcomingReminders'];

  const revenueStats = db.prepare(`
    SELECT COALESCE(SUM(payment_agreed), 0) AS total_agreed, COALESCE(SUM(payment_received), 0) AS total_received
    FROM projects WHERE deleted_at IS NULL
  `).get() as DashboardData['revenueStats'];

  const projectsByStage = db.prepare(`
    SELECT stage, COUNT(*) AS count FROM projects WHERE deleted_at IS NULL GROUP BY stage
  `).all() as DashboardData['projectsByStage'];

  const recentActivity = db.prepare(`
    SELECT w.entry, w.logged_at, p.name AS project_name
    FROM work_log w JOIN projects p ON w.project_id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY w.logged_at DESC
    LIMIT 10
  `).all() as DashboardData['recentActivity'];

  const projectPayments = db.prepare(`
    SELECT name, payment_agreed, payment_received FROM projects
    WHERE deleted_at IS NULL
    ORDER BY payment_agreed DESC
  `).all() as DashboardData['projectPayments'];

  return { leadStats, projectCount, topLeads, upcomingReminders, revenueStats, projectsByStage, recentActivity, projectPayments };
}
