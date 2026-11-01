import type Database from 'better-sqlite3';
import type { SearchHit } from '../../../shared/types.ts';

// Global search for the command palette: plain LIKE over names and reminder text
export function search(db: Database.Database, query: string): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const leads = db.prepare(`
    SELECT id, name, category, city FROM leads
    WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\'
    ORDER BY CASE WHEN score IS NULL THEN 1 ELSE 0 END, score DESC, name
    LIMIT 8
  `).all(pattern) as { id: number; name: string; category: string | null; city: string | null }[];

  const projects = db.prepare(`
    SELECT id, name, stage FROM projects
    WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\'
    ORDER BY name LIMIT 5
  `).all(pattern) as { id: number; name: string; stage: string }[];

  const reminders = db.prepare(`
    SELECT id, message, due_date, is_done FROM reminders
    WHERE deleted_at IS NULL AND message LIKE ? ESCAPE '\\'
    ORDER BY is_done, due_date LIMIT 5
  `).all(pattern) as { id: number; message: string; due_date: string; is_done: number }[];

  return [
    ...leads.map((l): SearchHit => ({
      type: 'lead', id: l.id, title: l.name,
      subtitle: ['Lead', l.category, l.city].filter(Boolean).join(' · '),
    })),
    ...projects.map((p): SearchHit => ({ type: 'project', id: p.id, title: p.name, subtitle: `Project · ${p.stage}` })),
    ...reminders.map((r): SearchHit => ({
      type: 'reminder', id: r.id, title: r.message,
      subtitle: `Reminder · ${r.is_done ? 'done' : `due ${r.due_date}`}`,
    })),
  ];
}
