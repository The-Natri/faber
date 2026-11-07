import type { Migration } from '../migrate.ts';

// Website audit (Phase 6): a Google Lighthouse audit of the lead's own site, run through Otari's MCP
// support. Stored as JSON (scores, two lab metrics, Model A's quality rating, reason and top fixes) with
// the time it ran. Existing rows stay unaudited.
export const websiteAudit: Migration = {
  version: 12,
  name: 'website_audit',
  up: (db) => db.exec(`
    ALTER TABLE leads ADD COLUMN website_audit TEXT;
    ALTER TABLE leads ADD COLUMN website_audited_at TEXT;
  `),
};
