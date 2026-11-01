import type { Migration } from '../migrate.ts';

// AI website check (Phase 2): Model A's verdict lives in the existing website_status column, which has
// no CHECK constraint, so it simply gains the value 'outdated'. These columns keep why: the evidence
// URL, a one-line reason, and when the check ran. Existing rows stay 'unknown' and unchecked.
export const websiteCheck: Migration = {
  version: 11,
  name: 'website_check',
  up: (db) => db.exec(`
    ALTER TABLE leads ADD COLUMN website_evidence TEXT;
    ALTER TABLE leads ADD COLUMN website_reason TEXT;
    ALTER TABLE leads ADD COLUMN website_checked_at TEXT;
    CREATE INDEX idx_leads_website_status ON leads(website_status);
  `),
};
