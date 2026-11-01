import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { Project, ProjectStage, ProjectWithLog, WorkLog } from '../../../shared/types.ts';

export interface NewProject {
  name: string;
  category?: string | null;
  phone?: string | null;
  scope?: string | null;
  payment_agreed?: number | null;
  deadline?: string | null;
  notes?: string | null;
}

export type ProjectUpdate = Partial<Pick<Project,
  'name' | 'category' | 'phone' | 'scope' | 'stage' | 'payment_agreed' | 'payment_received' | 'deadline' | 'notes'>>;

const UPDATABLE = ['name', 'category', 'phone', 'scope', 'stage', 'payment_agreed', 'payment_received', 'deadline', 'notes'] as const;

export function requireProject(db: Database.Database, id: number): Project {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL').get(id) as Project | undefined;
  if (!project) throw new AppError('NOT_FOUND', `Project ${id} not found`);
  return project;
}

export function listProjects(db: Database.Database): ProjectWithLog[] {
  const projects = db.prepare('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC').all() as Project[];
  const logs = db.prepare('SELECT * FROM work_log ORDER BY logged_at DESC').all() as WorkLog[];
  return projects.map((project) => ({ ...project, workLog: logs.filter((l) => l.project_id === project.id) }));
}

const emptyToNull = (value: string | null | undefined) => (value == null || value === '' ? null : value);

export function createProject(db: Database.Database, data: NewProject): Project {
  const result = db.prepare(`
    INSERT INTO projects (name, category, phone, scope, payment_agreed, deadline, notes, stage, payment_received)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ongoing', 0)
  `).run(
    data.name,
    emptyToNull(data.category),
    emptyToNull(data.phone),
    emptyToNull(data.scope),
    data.payment_agreed ?? null,
    emptyToNull(data.deadline),
    emptyToNull(data.notes)
  );
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid) as Project;
}

export function updateProject(db: Database.Database, id: number, fields: ProjectUpdate) {
  requireProject(db, id);
  const keys = UPDATABLE.filter((k) => fields[k] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE projects SET ${sets}, last_updated = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => fields[k] ?? null), id);
}

export function updateProjectStage(db: Database.Database, id: number, stage: ProjectStage) {
  requireProject(db, id);
  db.prepare(`UPDATE projects SET stage = ?, last_updated = datetime('now') WHERE id = ?`).run(stage, id);
}

export function addWorkLog(db: Database.Database, projectId: number, entry: string): WorkLog {
  requireProject(db, projectId);
  const result = db.prepare('INSERT INTO work_log (project_id, entry) VALUES (?, ?)').run(projectId, entry);
  return db.prepare('SELECT * FROM work_log WHERE id = ?').get(result.lastInsertRowid) as WorkLog;
}

export function softDeleteProject(db: Database.Database, id: number) {
  requireProject(db, id);
  db.prepare(`UPDATE projects SET deleted_at = datetime('now') WHERE id = ?`).run(id);
}
