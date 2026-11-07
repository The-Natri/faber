import type Database from 'better-sqlite3';
import type OpenAI from 'openai';
import { APIConnectionTimeoutError, APIError } from 'openai';
import { AppError } from '../../ipc/core.ts';
import type {
  AiActivity, AiConnectionTest, AiFeature, AiKeySource, AiOutcome, AiStatus, GuardrailResult,
} from '../../../shared/ai.ts';
import { monthSpend, recordAiActivity, type NewAiActivity } from './activity.ts';
import { createOtariClient, type OtariClientOptions } from './client.ts';

export interface AiConfig {
  apiKey: string | null;
  keySource: AiKeySource;
  baseUrl: string;
  models: AiStatus['models'];
  // Faber's own monthly AI cap in USD; undefined means no app-side cap
  monthlyCapUsd?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Tools Otari runs itself. Each search or fetch is priced per call ($0.01 on hosted EU).
export type OtariTool = { type: 'otari_web_search'; max_uses?: number } | { type: 'otari_web_fetch' };

// What Otari reports in `otari_tool_calls`. Sources are written by Otari, not the model; their titles
// are still third-party text and get screened before a model reads them.
export interface OtariToolCall {
  type: string;
  status: string;
  query?: string;
  url?: string;
  sources: { url: string; title: string }[];
}

export interface ChatRequest {
  feature: AiFeature;
  model: string;
  messages: ChatMessage[];
  // Budgets hold the whole max_tokens up front, so keep it as low as the answer allows
  maxTokens: number;
  temperature?: number;
  leadId?: number | null;
  timeoutMs?: number;
  tools?: OtariTool[];
  // For tool-only calls whose text is thrown away: an empty answer is not an error
  allowEmpty?: boolean;
}

export interface ChatResult {
  text: string;
  toolCalls: OtariToolCall[];
  activity: AiActivity;
}

export interface CodeRunRequest {
  feature: AiFeature;
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens: number;
  timeoutMs?: number;
}

export interface CodeRunResult {
  // The model's final answer
  text: string;
  // Each piece of code Otari ran, in order
  code: string[];
  // Everything the code printed
  logs: string;
  activity: AiActivity;
}

function toolCallsFrom(value: unknown): OtariToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const call = asObject(raw);
    if (!call) return [];
    const sources = Array.isArray(call.sources) ? call.sources.flatMap((s) => {
      const source = asObject(s);
      return source && typeof source.url === 'string' ? [{ url: source.url, title: typeof source.title === 'string' ? source.title : '' }] : [];
    }) : [];
    return [{
      type: String(call.type ?? ''), status: String(call.status ?? ''), sources,
      ...(typeof call.query === 'string' ? { query: call.query } : {}),
      ...(typeof call.url === 'string' ? { url: call.url } : {}),
    }];
  });
}

export type AiErrorKind = 'not_configured' | 'blocked' | 'budget' | 'auth' | 'timeout' | 'empty' | 'failed';

// Every AI failure is one of these; features catch it and fall back (templates, "couldn't check").
// `activity` is the logged row, absent only when no call was made.
export class AiError extends AppError {
  constructor(public kind: AiErrorKind, message: string, public activity: AiActivity | null = null) {
    super('UNAVAILABLE', message);
  }
}

const MESSAGES: Record<Exclude<AiErrorKind, 'failed'>, string> = {
  not_configured: 'Add your Otari API key in Arcana → Integrations to use AI features.',
  blocked: "Otari's guardrail blocked this request: it looked like a prompt injection or contained personal data.",
  budget: 'The Otari spend limit has been reached. AI features are paused until it resets.',
  auth: 'Otari rejected the API key. Check it in Arcana → Integrations.',
  timeout: "Otari didn't answer in time.",
  empty: 'The model returned an empty answer.',
};

// Otari's own limits, as opposed to Faber's cap: a spend ceiling or budget in the Otari dashboard
// (403 budget_exceeded), or an empty Otari balance (402)
export function otariBudgetMessage(code: string | null, scope: string | null): string {
  if (code === 'insufficient_funds' || code === 'pricing_required') {
    return "Otari refused the call: the account's balance is too low (insufficient funds). AI features use their non-AI paths until it's topped up in Otari.";
  }
  return `Otari's spend limit refused the call${scope ? ` (its ${scope.replace(/_/g, ' ')} limit)` : ''}. `
    + 'AI features use their non-AI paths until the limit resets or is raised in the Otari dashboard.';
}

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json | null => (value && typeof value === 'object' ? (value as Json) : null);
const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// `Otari-Guardrails` is a JSON list of {profile, mode, valid, score}; any invalid entry means flagged
export function guardrailFrom(header: string | null): GuardrailResult {
  if (!header) return 'not_reported';
  try {
    const verdicts = JSON.parse(header) as { valid?: boolean | null }[];
    if (!Array.isArray(verdicts) || verdicts.length === 0) return 'not_reported';
    if (verdicts.some((v) => v.valid === false)) return 'blocked';
    return verdicts.every((v) => v.valid === true) ? 'passed' : 'not_reported';
  } catch {
    return 'not_reported';
  }
}

// Otari puts its error code in the `Otari-Error-Code` header, in `code`, or inside `detail`
export function otariErrorCode(headers: Headers | undefined, body: unknown): string | null {
  const fromHeader = headers?.get('otari-error-code');
  if (fromHeader) return fromHeader;
  const object = asObject(body);
  if (!object) return null;
  if (typeof object.code === 'string') return object.code;
  const detail = asObject(object.detail);
  return detail && typeof detail.code === 'string' ? detail.code : null;
}

function classify(status: number | null, code: string | null): AiErrorKind {
  if (code === 'guardrail_violation') return 'blocked';
  if (code === 'budget_exceeded' || code === 'insufficient_funds' || status === 402) return 'budget';
  if (status === 401) return 'auth';
  if (status === 504) return 'timeout';
  return 'failed';
}

const OUTCOME: Record<AiErrorKind, AiOutcome> = {
  not_configured: 'error', blocked: 'blocked', budget: 'budget', auth: 'error', timeout: 'error', empty: 'error', failed: 'error',
};

export class OtariGateway {
  constructor(
    private readonly db: () => Database.Database,
    private readonly config: () => AiConfig,
    private readonly makeClient: (options: OtariClientOptions) => OpenAI = createOtariClient,
  ) {}

  status(): AiStatus {
    const { apiKey, keySource, baseUrl, models } = this.config();
    return { configured: Boolean(apiKey), keySource: apiKey ? keySource : 'none', baseUrl, models };
  }

  private client(timeoutMs?: number): OpenAI {
    const { apiKey, baseUrl } = this.config();
    if (!apiKey) throw new AiError('not_configured', MESSAGES.not_configured);
    return this.makeClient({ baseUrl, apiKey, timeoutMs });
  }

  // Free: lists the models this key can call. Proves the key and base URL without spending.
  async countModels(): Promise<number> {
    try {
      const page = await this.client().models.list();
      return page.data.length;
    } catch (error) {
      if (error instanceof AiError) throw error;
      const status = error instanceof APIError ? error.status ?? null : null;
      const kind = classify(status, null);
      throw new AiError(kind, kind === 'failed' ? `Otari could not be reached${status ? ` (HTTP ${status})` : ''}.` : MESSAGES[kind]);
    }
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const client = this.client(request.timeoutMs);
    const started = Date.now();
    const base: Pick<NewAiActivity, 'feature' | 'lead_id' | 'model_requested'> = {
      feature: request.feature, lead_id: request.leadId ?? null, model_requested: request.model,
    };
    // Upper bound for this call: a web search is $0.01 plus tokens; anything else is fractions of a cent
    this.checkFaberCap(request.tools?.length ? 0.011 : 0.002, base);

    try {
      const { data, response } = await client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        // Otari's own tool types aren't in the SDK's union; the gateway runs them, not the model's provider
        ...(request.tools ? { tools: request.tools as unknown as OpenAI.Chat.ChatCompletionTool[] } : {}),
      }).withResponse();

      const headers = response.headers;
      const usage = asObject(data.usage);
      const details = asObject(usage?.completion_tokens_details);
      const text = (data.choices[0]?.message?.content ?? '').trim();
      const toolCalls = toolCallsFrom((data as unknown as Json).otari_tool_calls);
      const answered = Boolean(text) || request.allowEmpty === true;
      const activity = recordAiActivity(this.db(), {
        ...base,
        model_served: headers.get('otari-model'),
        provider: headers.get('otari-provider'),
        fallback: headers.get('otari-fallback') === 'true' ? 1 : 0,
        attempt_count: asNumber(headers.get('otari-attempt-count')),
        request_id: headers.get('otari-request-id'),
        guardrail: guardrailFrom(headers.get('otari-guardrails')),
        outcome: answered ? 'ok' : 'error',
        http_status: response.status,
        error_code: answered ? null : 'empty_completion',
        prompt_tokens: asNumber(usage?.prompt_tokens),
        completion_tokens: asNumber(usage?.completion_tokens),
        reasoning_tokens: asNumber(details?.reasoning_tokens),
        // A six-decimal USD string, or null when nothing was priced
        cost_usd: asNumber(usage?.cost_usd),
        latency_ms: Date.now() - started,
      });
      if (!answered) throw new AiError('empty', MESSAGES.empty, activity);
      return { text, toolCalls, activity };
    } catch (error) {
      throw this.failure(error, base, started);
    }
  }

  // Code execution through /responses with code_interpreter, run by Otari itself (Otari-Code-Execution:
  // otari). Unlike Chat Completions, /responses hands back the code that ran and its output, so Faber can
  // show it. Same cap check, guardrail, logging and error mapping as chat().
  async codeRun(request: CodeRunRequest): Promise<CodeRunResult> {
    const client = this.client(request.timeoutMs ?? 90_000);
    const started = Date.now();
    const base: Pick<NewAiActivity, 'feature' | 'lead_id' | 'model_requested'> = {
      feature: request.feature, lead_id: null, model_requested: request.model,
    };
    // A code run is $0.01 plus tokens
    this.checkFaberCap(0.011, base);

    try {
      const { data, response } = await client.responses.create({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        max_output_tokens: request.maxOutputTokens,
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
      }, { headers: { 'Otari-Code-Execution': 'otari' } }).withResponse();

      const code: string[] = [];
      let logs = '';
      for (const item of data.output ?? []) {
        if (item.type !== 'code_interpreter_call') continue;
        if (item.code) code.push(item.code);
        for (const output of item.outputs ?? []) if (output.type === 'logs') logs += output.logs;
      }
      const text = (data.output_text ?? '').trim();
      const headers = response.headers;
      const usage = asObject(data.usage);
      const details = asObject(usage?.output_tokens_details);
      const answered = Boolean(text) || code.length > 0;
      const activity = recordAiActivity(this.db(), {
        ...base,
        model_served: headers.get('otari-model'),
        provider: headers.get('otari-provider'),
        fallback: headers.get('otari-fallback') === 'true' ? 1 : 0,
        attempt_count: asNumber(headers.get('otari-attempt-count')),
        request_id: headers.get('otari-request-id'),
        guardrail: guardrailFrom(headers.get('otari-guardrails')),
        outcome: answered ? 'ok' : 'error',
        http_status: response.status,
        error_code: answered ? null : 'empty_completion',
        prompt_tokens: asNumber(usage?.input_tokens),
        completion_tokens: asNumber(usage?.output_tokens),
        reasoning_tokens: asNumber(details?.reasoning_tokens),
        cost_usd: asNumber(usage?.cost_usd),
        latency_ms: Date.now() - started,
      });
      if (!answered) throw new AiError('empty', MESSAGES.empty, activity);
      return { text, code, logs, activity };
    } catch (error) {
      throw this.failure(error, base, started);
    }
  }

  // Logs a failed call and turns it into the AiError features degrade from
  private failure(error: unknown, base: Pick<NewAiActivity, 'feature' | 'lead_id' | 'model_requested'>, started: number): AiError {
    if (error instanceof AiError) return error;
    const apiError = error instanceof APIError ? error : null;
    const status = apiError?.status ?? null;
    const code = apiError ? otariErrorCode(apiError.headers, apiError.error) : null;
    const kind = error instanceof APIConnectionTimeoutError ? 'timeout' : classify(status, code);
    const activity = recordAiActivity(this.db(), {
      ...base,
      model_served: null,
      provider: null,
      fallback: 0,
      attempt_count: null,
      request_id: apiError?.headers?.get('otari-request-id') ?? null,
      guardrail: kind === 'blocked' ? 'blocked' : 'not_reported',
      outcome: OUTCOME[kind],
      http_status: status,
      error_code: code ?? (status ? `http_${status}` : 'no_response'),
      prompt_tokens: null,
      completion_tokens: null,
      reasoning_tokens: null,
      cost_usd: null,
      latency_ms: Date.now() - started,
    });
    const message = kind === 'failed'
      ? `Otari couldn't complete the request${status ? ` (HTTP ${status})` : ' (no response)'}.`
      : kind === 'budget' ? otariBudgetMessage(code, apiError?.headers?.get('otari-budget-scope') ?? null)
        : MESSAGES[kind];
    return new AiError(kind, message, activity);
  }

  // Faber's own monthly cap (Arcana → Integrations), checked before Otari is called, on top of Otari's
  // own ceilings. A refused call is logged like any other, so it shows in AI Activity.
  private checkFaberCap(next: number, base: Pick<NewAiActivity, 'feature' | 'lead_id' | 'model_requested'>) {
    const cap = this.config().monthlyCapUsd;
    if (cap === undefined) return;
    const spent = monthSpend(this.db()).totalUsd;
    if (spent + next <= cap) return;
    const activity = recordAiActivity(this.db(), {
      ...base, model_served: null, provider: null, fallback: 0, attempt_count: null, request_id: null, guardrail: 'not_reported',
      outcome: 'budget', http_status: null, error_code: 'faber_cap', prompt_tokens: null, completion_tokens: null,
      reasoning_tokens: null, cost_usd: null, latency_ms: 0,
    });
    throw new AiError('budget',
      `Faber's own monthly AI cap of $${cap.toFixed(2)} is reached ($${spent.toFixed(4)} spent this month), so Faber didn't call Otari. `
      + 'AI features use their non-AI paths until next month, or until you raise the cap in Arcana → Integrations.', activity);
  }

  // Arcana → Integrations → Test connection: a free model list, then one tiny call through Model A
  // so the result shows which model and provider served it and what the guardrail said.
  async testConnection(): Promise<AiConnectionTest> {
    let modelCount: number;
    try {
      modelCount = await this.countModels();
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), modelCount: null, served: null };
    }
    try {
      const { activity } = await this.chat({
        feature: 'connection_test',
        model: this.config().models.verify,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
        maxTokens: 8,
        timeoutMs: 20_000,
      });
      return {
        ok: true,
        message: `Connected. ${modelCount} models available; Model A answered.`,
        modelCount,
        served: {
          model: activity.model_served, provider: activity.provider, fallback: activity.fallback === 1,
          guardrail: activity.guardrail, costUsd: activity.cost_usd, latencyMs: activity.latency_ms,
        },
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error), modelCount, served: null };
    }
  }
}
