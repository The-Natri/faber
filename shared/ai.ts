// AI through the Otari gateway: the model plan, the activity log shape, and what the renderer may see.
// Every model here is open-weight. Network calls happen only in main; the key never reaches the renderer.

export const OTARI_EU_BASE_URL = 'https://eu.api.otari.ai/api/v1';

// Model roles. A is a dashboard routing policy (mistral-small-2603 on Mistral, then Mistral Large 3
// on Bedrock); B and the screener are catalog ids.
export const DEFAULT_MODELS = {
  verify: 'faber-verify',
  pitch: 'deepseek/deepseek-v4-pro',
  screener: 'openai/gpt-oss-safeguard-20b',
} as const;

export type AiFeature = 'connection_test' | 'screen' | 'web_search' | 'website_check' | 'name_match' | 'pitch' | 'pipeline_question';

export type AiOutcome = 'ok' | 'blocked' | 'budget' | 'error';

// ---- Website check (Phase 2) ----

export type WebsiteVerdict = 'has_site' | 'no_site' | 'outdated_site' | 'unknown';

export interface WebsiteCheckResult {
  leadId: number;
  name: string;
  verdict: WebsiteVerdict;
  evidenceUrl: string | null;
  reason: string;
  // 'fetch' read the lead's own website_url; 'search' looked the business up
  path: 'fetch' | 'search';
  screen: 'safe' | 'unsafe' | 'unscreened';
  // The Model A call that decided, when one ran
  servedModel: string | null;
  provider: string | null;
  fallback: boolean;
  // Every Otari call for this lead: search, screen and decision
  costUsd: number;
  // Set when the check could not run (no key, spend limit, Otari down); the lead is left unchanged
  error: string | null;
  // Why, for an AI failure: a batch stops on 'budget', 'not_configured' and 'auth', which no next lead fixes
  errorKind: string | null;
}

export interface WebsiteCheckState {
  running: boolean;
  processed: number;
  total: number;
  current: { id: number; name: string } | null;
  // Newest first
  results: WebsiteCheckResult[];
  costUsd: number;
  error: string | null;
}

// ---- Name-match helper (Phase 2) ----

export interface NameMatchSuggestion {
  leadId: number;
  decision: 'match' | 'no_match' | 'unsure';
  // The business's name as listed online, for a match
  suggestedName: string | null;
  evidenceUrl: string | null;
  reason: string;
  costUsd: number;
}

// What Otari's mandated guardrail (Lakera) said about the request's latest user message
export type GuardrailResult = 'passed' | 'blocked' | 'not_reported';

export interface AiActivity {
  id: number;
  created_at: string;
  feature: AiFeature;
  lead_id: number | null;
  model_requested: string;
  model_served: string | null;
  provider: string | null;
  fallback: number;
  attempt_count: number | null;
  request_id: string | null;
  guardrail: GuardrailResult;
  outcome: AiOutcome;
  http_status: number | null;
  error_code: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number;
}

export interface AiActivityPage {
  entries: AiActivity[];
  totals: { calls: number; cost_usd: number; fallbacks: number; blocked: number };
}

// Where the key in use came from. 'dev_env' only exists in dev runs (../faber-private/.env).
export type AiKeySource = 'settings' | 'dev_env' | 'none';

export interface AiStatus {
  configured: boolean;
  keySource: AiKeySource;
  baseUrl: string;
  models: { verify: string; pitch: string; screener: string };
}

export interface AiConnectionTest {
  ok: boolean;
  message: string;
  modelCount: number | null;
  served: { model: string | null; provider: string | null; fallback: boolean; guardrail: GuardrailResult; costUsd: number | null; latencyMs: number } | null;
}
