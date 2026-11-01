import type Database from 'better-sqlite3';
import type { AiActivity, AiActivityPage } from '../../../shared/ai.ts';

export type NewAiActivity = Omit<AiActivity, 'id' | 'created_at'>;

// One row per Otari call, written whatever the outcome, so spend and fallbacks are never invisible
export function recordAiActivity(db: Database.Database, entry: NewAiActivity): AiActivity {
  const result = db.prepare(`
    INSERT INTO ai_activity (feature, lead_id, model_requested, model_served, provider, fallback, attempt_count, request_id,
                             guardrail, outcome, http_status, error_code, prompt_tokens, completion_tokens, reasoning_tokens,
                             cost_usd, latency_ms)
    VALUES (@feature, @lead_id, @model_requested, @model_served, @provider, @fallback, @attempt_count, @request_id,
            @guardrail, @outcome, @http_status, @error_code, @prompt_tokens, @completion_tokens, @reasoning_tokens,
            @cost_usd, @latency_ms)
  `).run(entry);
  return db.prepare('SELECT * FROM ai_activity WHERE id = ?').get(result.lastInsertRowid) as AiActivity;
}

export function listAiActivity(db: Database.Database, limit = 200): AiActivityPage {
  const entries = db.prepare('SELECT * FROM ai_activity ORDER BY id DESC LIMIT ?').all(limit) as AiActivity[];
  const totals = db.prepare(`
    SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost_usd,
           COALESCE(SUM(fallback), 0) AS fallbacks, COALESCE(SUM(outcome = 'blocked'), 0) AS blocked
    FROM ai_activity
  `).get() as AiActivityPage['totals'];
  return { entries, totals };
}
