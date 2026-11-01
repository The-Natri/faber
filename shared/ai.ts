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

export type AiFeature = 'connection_test' | 'screen' | 'website_check' | 'pitch' | 'pipeline_question';

export type AiOutcome = 'ok' | 'blocked' | 'budget' | 'error';

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
