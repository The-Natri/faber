import type { Migration } from '../migrate.ts';

// Soft delete: a delete sets deleted_at; Arcana → Trash restores or purges.
// Also the indexes for the hot lookups that exist so far (§6.3).
export const softDeleteAndIndexes: Migration = {
  version: 4,
  name: 'soft_delete_and_indexes',
  up: (db) => db.exec(`
    ALTER TABLE leads ADD COLUMN deleted_at TEXT;
    ALTER TABLE projects ADD COLUMN deleted_at TEXT;
    ALTER TABLE payments ADD COLUMN deleted_at TEXT;
    ALTER TABLE reminders ADD COLUMN deleted_at TEXT;

    CREATE INDEX idx_leads_status ON leads(status);
    CREATE INDEX idx_leads_score ON leads(score);
    CREATE INDEX idx_leads_deleted_at ON leads(deleted_at);
    CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);
    CREATE INDEX idx_payments_project_id ON payments(project_id);
    CREATE INDEX idx_payments_deleted_at ON payments(deleted_at);
    CREATE INDEX idx_reminders_due_date ON reminders(due_date);
    CREATE INDEX idx_reminders_entity ON reminders(entity_type, entity_id);
    CREATE INDEX idx_reminders_deleted_at ON reminders(deleted_at);
    CREATE INDEX idx_work_log_project_id ON work_log(project_id);
  `),
};
