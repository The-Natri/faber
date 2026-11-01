import type { Migration } from '../migrate.ts';

// Phase 2b pipeline: CRM columns on leads, the activity timeline and the project ↔ lead link
// (won leads are kept from now on, §6.2). Existing values are untouched; existing projects keep
// lead_id = NULL. status gains replied / meeting / proposal / won (no CHECK constraint in v1).
export const pipeline: Migration = {
  version: 9,
  name: 'pipeline',
  up: (db) => db.exec(`
    ALTER TABLE leads ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE leads ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE leads ADD COLUMN lost_reason TEXT;
    ALTER TABLE leads ADD COLUMN owner_name TEXT;
    ALTER TABLE leads ADD COLUMN best_time TEXT;
    ALTER TABLE leads ADD COLUMN last_contacted_at TEXT;
    ALTER TABLE leads ADD COLUMN website_url TEXT;
    ALTER TABLE leads ADD COLUMN website_status TEXT NOT NULL DEFAULT 'unknown';

    ALTER TABLE projects ADD COLUMN lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

    CREATE TABLE lead_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('status_change', 'contact_attempt', 'visit', 'note', 'demo', 'quote')),
      channel TEXT CHECK (channel IN ('whatsapp', 'call', 'visit', 'instagram', 'email', 'other')),
      outcome TEXT,
      body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_lead_activity_lead_id ON lead_activity(lead_id, created_at);
    CREATE INDEX idx_leads_starred ON leads(starred);
    CREATE INDEX idx_projects_lead_id ON projects(lead_id);
  `),
};
