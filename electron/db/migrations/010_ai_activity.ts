import type { Migration } from '../migrate.ts';

// AI through Otari: one row per gateway call, whatever the outcome, so the AI Activity view can show
// which model served, whether a fallback or the guardrail stepped in, and what it cost.
// Kept apart from lead_activity, whose CHECK constraints describe outreach, not AI calls.
// The planned Claude integration is replaced by Otari, so its unused encrypted key is dropped.
export const aiActivity: Migration = {
  version: 10,
  name: 'ai_activity',
  up: (db) => db.exec(`
    CREATE TABLE ai_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      feature TEXT NOT NULL,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      model_requested TEXT NOT NULL,
      model_served TEXT,
      provider TEXT,
      fallback INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER,
      request_id TEXT,
      guardrail TEXT NOT NULL DEFAULT 'not_reported' CHECK (guardrail IN ('passed', 'blocked', 'not_reported')),
      outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'blocked', 'budget', 'error')),
      http_status INTEGER,
      error_code TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      reasoning_tokens INTEGER,
      cost_usd REAL,
      latency_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_ai_activity_created_at ON ai_activity(created_at);
    CREATE INDEX idx_ai_activity_lead_id ON ai_activity(lead_id);

    DELETE FROM app_settings WHERE key = 'secret:claudeApiKey';
  `),
};
