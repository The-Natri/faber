import type Database from 'better-sqlite3';
import type { AiActivity, AiActivityPage, AiFeature, AiSpend, SpendCategory } from '../../../shared/ai.ts';

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

const CATEGORY: Record<AiFeature, SpendCategory> = {
  web_search: 'website_check', website_check: 'website_check', name_match: 'name_match', pitch: 'pitch',
  screen: 'screener', pipeline_question: 'pipeline', connection_test: 'other',
};

// Start of the local calendar month, in the UTC "YYYY-MM-DD HH:MM:SS" form created_at uses
export function monthStart(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().replace('T', ' ').slice(0, 19);
}

// This month's AI spend from the activity log (Otari's inline usage.cost_usd), by category
export function monthSpend(db: Database.Database, now = new Date()): Omit<AiSpend, 'capUsd' | 'capReached'> {
  const rows = db.prepare(`
    SELECT feature, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS usd FROM ai_activity WHERE created_at >= ? GROUP BY feature
  `).all(monthStart(now)) as { feature: AiFeature; calls: number; usd: number }[];
  const byCategory: AiSpend['byCategory'] = {
    website_check: { usd: 0, calls: 0 }, name_match: { usd: 0, calls: 0 }, pitch: { usd: 0, calls: 0 }, screener: { usd: 0, calls: 0 },
    pipeline: { usd: 0, calls: 0 }, other: { usd: 0, calls: 0 },
  };
  for (const row of rows) {
    const bucket = byCategory[CATEGORY[row.feature] ?? 'other'];
    bucket.usd += row.usd;
    bucket.calls += row.calls;
  }
  for (const bucket of Object.values(byCategory)) bucket.usd = Number(bucket.usd.toFixed(6));
  return {
    monthLabel: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    totalUsd: Number(rows.reduce((sum, r) => sum + r.usd, 0).toFixed(6)),
    calls: rows.reduce((sum, r) => sum + r.calls, 0),
    byCategory,
  };
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
