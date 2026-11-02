import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import { DEFAULT_MODELS, OTARI_EU_BASE_URL } from '../../../shared/ai.ts';
import { listAiActivity, monthSpend } from './activity.ts';
import { createOtariClient } from './client.ts';
import { AiError, OtariGateway, guardrailFrom, otariErrorCode, type AiConfig } from './gateway.ts';

const KEY = 'test-otari-key-not-real';

let dir: string;
let db: Database.Database;
let sent: { url: string; method: string; headers: Headers; body: unknown }[];
let replies: Response[];

// Stands in for Otari: records what was sent and answers with the queued replies, in order
const fakeFetch: typeof fetch = async (input, init) => {
  sent.push({
    url: String(input instanceof Request ? input.url : input),
    method: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  });
  const reply = replies.shift();
  if (!reply) throw new Error('no reply queued');
  return reply;
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const completion = (content: string, usage: Record<string, unknown> = {}) => ({
  id: 'chatcmpl-1', object: 'chat.completion', created: 0, model: 'faber-verify',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
  usage: { prompt_tokens: 20, completion_tokens: 42, total_tokens: 62, cost_usd: '0.000073', ...usage },
});

const config = (apiKey: string | null = KEY): AiConfig => ({
  apiKey, keySource: apiKey ? 'settings' : 'none', baseUrl: OTARI_EU_BASE_URL, models: { ...DEFAULT_MODELS },
});

const gateway = (apiKey: string | null = KEY) =>
  new OtariGateway(() => db, () => config(apiKey), (options) => createOtariClient({ ...options, fetch: fakeFetch }));

const ask = (g: OtariGateway) => g.chat({
  feature: 'website_check', model: 'faber-verify', leadId: null, maxTokens: 60,
  messages: [{ role: 'user', content: 'In one sentence, what does a small local bakery gain from having a website?' }],
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-ai-'));
  db = new Database(path.join(dir, 'faber.db'));
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
  sent = [];
  replies = [];
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('OtariGateway.chat', () => {
  it('sends the key only as Otari-Key and logs which model served, the fallback and the cost', async () => {
    replies.push(json(200, completion('Visibility and online orders.'), {
      'otari-request-id': 'req-1', 'otari-provider': 'bedrock', 'otari-model': 'mistral.mistral-large-3-675b-instruct',
      'otari-fallback': 'true', 'otari-attempt-count': '2',
      'otari-guardrails': JSON.stringify([{ profile: 'lakera-faber', mode: 'block', valid: true, score: 0 }]),
    }));

    const { text, activity } = await ask(gateway());

    expect(text).toBe('Visibility and online orders.');
    const [request] = sent;
    expect(request.url).toBe(`${OTARI_EU_BASE_URL}/chat/completions`);
    expect(request.headers.get('otari-key')).toBe(KEY);
    expect(request.headers.has('authorization')).toBe(false);
    expect(request.body).toMatchObject({ model: 'faber-verify', max_tokens: 60 });
    expect(activity).toMatchObject({
      feature: 'website_check', model_requested: 'faber-verify', model_served: 'mistral.mistral-large-3-675b-instruct',
      provider: 'bedrock', fallback: 1, attempt_count: 2, request_id: 'req-1', guardrail: 'passed', outcome: 'ok',
      http_status: 200, prompt_tokens: 20, completion_tokens: 42, cost_usd: 0.000073,
    });
  });

  it('turns a guardrail refusal into a blocked AiError and logs it', async () => {
    replies.push(json(403, { detail: { message: 'Request blocked by guardrail policy.', code: 'guardrail_violation', guardrails: [] } },
      { 'otari-request-id': 'req-2' }));

    const error = await ask(gateway()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).kind).toBe('blocked');
    expect((error as AiError).activity).toMatchObject({ outcome: 'blocked', guardrail: 'blocked', http_status: 403, error_code: 'guardrail_violation', request_id: 'req-2', cost_usd: null });
  });

  it('reports a spend limit as budget, from the Otari-Error-Code header', async () => {
    replies.push(json(403, { detail: 'Workspace has $0.00001 of budget remaining', code: 'budget_exceeded' },
      { 'otari-error-code': 'budget_exceeded', 'otari-budget-scope': 'workspace' }));

    const error = (await ask(gateway()).catch((e: unknown) => e)) as AiError;

    expect(error.kind).toBe('budget');
    expect(error.activity?.outcome).toBe('budget');
  });

  it('treats an empty answer as an error rather than an empty draft', async () => {
    replies.push(json(200, completion('', { completion_tokens: 60, completion_tokens_details: { reasoning_tokens: 60 } })));

    const error = (await ask(gateway()).catch((e: unknown) => e)) as AiError;

    expect(error.kind).toBe('empty');
    expect(error.activity).toMatchObject({ outcome: 'error', error_code: 'empty_completion', reasoning_tokens: 60 });
  });

  it('maps an all-candidates-timed-out 504 to timeout', async () => {
    replies.push(json(504, { detail: 'All upstream providers timed out' }, { 'otari-error-retryable': 'true' }));

    const error = (await ask(gateway()).catch((e: unknown) => e)) as AiError;

    expect(error.kind).toBe('timeout');
    expect(error.activity).toMatchObject({ outcome: 'error', http_status: 504, error_code: 'http_504' });
  });

  it('makes no call and logs nothing without a key', async () => {
    const error = (await ask(gateway(null)).catch((e: unknown) => e)) as AiError;

    expect(error.kind).toBe('not_configured');
    expect(sent).toHaveLength(0);
    expect(listAiActivity(db).totals.calls).toBe(0);
  });
});

describe('OtariGateway.testConnection', () => {
  it('lists models for free, then makes one tiny call through Model A', async () => {
    replies.push(json(200, { object: 'list', data: [{ id: 'a', object: 'model' }, { id: 'b', object: 'model' }] }));
    replies.push(json(200, completion('ready'), { 'otari-provider': 'mistral', 'otari-model': 'mistral-small-2603', 'otari-fallback': 'false' }));

    const result = await gateway().testConnection();

    expect(sent.map((r) => [r.method, r.url.replace(OTARI_EU_BASE_URL, '')])).toEqual([['GET', '/models'], ['POST', '/chat/completions']]);
    expect(sent[1].body).toMatchObject({ model: DEFAULT_MODELS.verify, max_tokens: 8 });
    expect(result).toMatchObject({ ok: true, modelCount: 2, served: { model: 'mistral-small-2603', provider: 'mistral', fallback: false } });
  });

  it('stops after the model list when the key is rejected', async () => {
    replies.push(json(401, { detail: 'Invalid API key' }));

    const result = await gateway().testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/rejected the API key/);
    expect(sent).toHaveLength(1);
  });
});

describe('activity log', () => {
  it('totals calls, cost, fallbacks and blocks across outcomes', async () => {
    replies.push(json(200, completion('one'), { 'otari-fallback': 'true' }));
    replies.push(json(403, { detail: { code: 'guardrail_violation' } }));
    await ask(gateway());
    await ask(gateway()).catch(() => undefined);

    const page = listAiActivity(db);

    expect(page.entries.map((e) => e.outcome)).toEqual(['blocked', 'ok']);
    expect(page.totals).toEqual({ calls: 2, cost_usd: 0.000073, fallbacks: 1, blocked: 1 });
  });
});

describe('response parsing', () => {
  it('reads the guardrail verdict header', () => {
    expect(guardrailFrom(null)).toBe('not_reported');
    expect(guardrailFrom('[{"valid":true,"score":0}]')).toBe('passed');
    expect(guardrailFrom('[{"valid":true},{"valid":false}]')).toBe('blocked');
    expect(guardrailFrom('[{"valid":null,"score":null}]')).toBe('not_reported');
    expect(guardrailFrom('not json')).toBe('not_reported');
  });

  it('finds the Otari error code in the header, the body or its detail', () => {
    expect(otariErrorCode(new Headers({ 'otari-error-code': 'budget_exceeded' }), {})).toBe('budget_exceeded');
    expect(otariErrorCode(undefined, { code: 'insufficient_funds' })).toBe('insufficient_funds');
    expect(otariErrorCode(undefined, { detail: { code: 'guardrail_violation' } })).toBe('guardrail_violation');
    expect(otariErrorCode(undefined, { detail: 'plain text' })).toBeNull();
  });
});

describe("Faber's monthly cap and Otari's limits", () => {
  const capped = (cap: number) => new OtariGateway(() => db, () => ({ ...config(), monthlyCapUsd: cap }), (options) => createOtariClient({ ...options, fetch: fakeFetch }));
  const spend = (usd: number, createdAt?: string) => db.prepare(`
    INSERT INTO ai_activity (feature, model_requested, outcome, cost_usd, latency_ms${createdAt ? ', created_at' : ''})
    VALUES ('pitch', 'faber-pitch', 'ok', ?, 1${createdAt ? ', ?' : ''})
  `).run(...(createdAt ? [usd, createdAt] : [usd]));

  it('refuses before calling Otari once the cap would be passed, and logs the refusal', async () => {
    spend(4.9995);
    const error = (await ask(capped(5)).catch((e: unknown) => e)) as AiError;

    expect(sent).toHaveLength(0);
    expect(error.kind).toBe('budget');
    expect(error.message).toMatch(/Faber's own monthly AI cap of \$5\.00 is reached/);
    expect(error.activity).toMatchObject({ outcome: 'budget', error_code: 'faber_cap', http_status: null, cost_usd: null });
  });

  it('lets calls through under the cap', async () => {
    spend(1);
    replies.push(json(200, completion('fine')));
    expect((await ask(capped(5))).text).toBe('fine');
  });

  it('counts only this month, by category', () => {
    spend(2, '2000-01-15 10:00:00');
    spend(0.25);
    db.prepare(`INSERT INTO ai_activity (feature, model_requested, outcome, cost_usd, latency_ms) VALUES ('web_search', 'faber-verify', 'ok', 0.0102, 1), ('screen', 'x', 'ok', 0.0001, 1), ('name_match', 'x', 'ok', 0.01, 1)`).run();

    const month = monthSpend(db);

    expect(month.totalUsd).toBe(0.2703);
    expect(month.byCategory).toMatchObject({
      pitch: { usd: 0.25, calls: 1 }, website_check: { usd: 0.0102, calls: 1 }, screener: { usd: 0.0001, calls: 1 }, name_match: { usd: 0.01, calls: 1 },
    });
  });

  it("names Otari's own limits differently from Faber's", async () => {
    replies.push(json(403, { detail: 'Key has $0.00 of budget remaining', code: 'budget_exceeded' }, { 'otari-error-code': 'budget_exceeded', 'otari-budget-scope': 'api_token' }));
    const ceiling = (await ask(gateway()).catch((e: unknown) => e)) as AiError;
    expect(ceiling.kind).toBe('budget');
    expect(ceiling.message).toMatch(/^Otari's spend limit refused the call \(its api token limit\)/);

    replies.push(json(402, { detail: 'no funds', code: 'insufficient_funds' }));
    const funds = (await ask(gateway()).catch((e: unknown) => e)) as AiError;
    expect(funds).toMatchObject({ kind: 'budget' });
    expect(funds.message).toMatch(/balance is too low/);
    expect(funds.activity?.error_code).toBe('insufficient_funds');
  });
});
