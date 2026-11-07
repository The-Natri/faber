import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import { DEFAULT_MODELS, OTARI_EU_BASE_URL, type AiActivity } from '../../../shared/ai.ts';
import { createOtariClient } from './client.ts';
import { OtariGateway, type CodeRunRequest } from './gateway.ts';
import { buildPipelineDataset } from './pipelineData.ts';
import { PIPELINE_INSTRUCTIONS, askPipeline, parseResultTable, type PipelineGateway } from './pipelineQuestion.ts';

let dir: string;
let db: Database.Database;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-pipeline-'));
  db = new Database(path.join(dir, 'faber.db'));
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function addLead(fields: Record<string, unknown>) {
  const values = { osm_id: `node/${Math.random()}`, name: 'Secret Bakery Name', category: 'Cafes', source: 'osm', city: 'Coimbatore',
    phone: '98765 43210', has_phone: 1, owner_name: 'Ravi Kumar', notes: 'private note', address: '12 Example Street', ...fields };
  const columns = Object.keys(values);
  db.prepare(`INSERT INTO leads (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`).run(values);
}

describe('buildPipelineDataset', () => {
  it('aggregates by segment and leaves out names, numbers, owners, notes and ids', () => {
    addLead({ score: 72, rating: 4.4, review_count: 100, website_status: 'none' });
    addLead({ score: 64, rating: 4.0, review_count: 50, website_status: 'none', last_contacted_at: '2026-11-01 10:00:00' });
    addLead({ category: 'Salons', city: 'Chennai', score: null, website_status: 'found', has_phone: 0, phone: null });
    addLead({ score: 90, website_status: 'none', deleted_at: '2026-11-01 10:00:00' });

    const dataset = buildPipelineDataset(db);

    expect(dataset).toMatchObject({ segments: 2, leads: 3 });
    const [header, first, second] = dataset.csv.split('\n');
    expect(header).toBe('category,city,website_status,stage,score_band,chain,leads,avg_score,avg_rating,avg_reviews,with_phone,with_social,contacted');
    expect(first).toBe('Cafes,Coimbatore,none,new,60-79,no,2,68,4.2,75,2,0,1');
    expect(second).toBe('Salons,Chennai,found,new,unscored,no,1,,,,0,0,0');
    for (const secret of ['Secret Bakery', '98765', 'Ravi', 'private note', 'Example Street', 'node/']) expect(dataset.csv).not.toContain(secret);
  });
});

describe('parseResultTable', () => {
  it('reads the CSV the code printed between the markers', () => {
    expect(parseResultTable('working…\nTABLE_START\ncategory,leads\nCafes,76\n"Food, drink",3\nTABLE_END\ndone')).toEqual({
      columns: ['category', 'leads'], rows: [['Cafes', '76'], ['Food, drink', '3']],
    });
    expect(parseResultTable('no table here')).toBeNull();
  });
});

describe('askPipeline', () => {
  it('sends the question and the anonymised table to Model A with code execution, and returns the computed result', async () => {
    addLead({ score: 72, website_status: 'none' });
    const requests: CodeRunRequest[] = [];
    const gateway: PipelineGateway = {
      status: () => ({ models: { verify: 'faber-verify' } }),
      codeRun: async (request) => {
        requests.push(request);
        return {
          text: '**Cafes** has the most leads without a website: 1.',
          code: ['import pandas as pd\nprint("TABLE_START")'],
          logs: 'TABLE_START\ncategory,leads\nCafes,1\nTABLE_END\n',
          activity: { model_served: 'mistral-small-2603', provider: 'mistral', fallback: 0, cost_usd: 0.0104, request_id: 'req-9' } as AiActivity,
        };
      },
    };

    const answer = await askPipeline(db, gateway, '  Which category has the most leads without a website? ');

    expect(requests[0]).toMatchObject({ feature: 'pipeline_question', model: 'faber-verify', instructions: PIPELINE_INSTRUCTIONS });
    expect(requests[0].input).toMatch(/^Question: Which category has the most leads without a website\?\n\nDataset \(CSV, 1 segments covering 1 leads\):\ncategory,city/);
    expect(requests[0].input).not.toContain('Secret Bakery');
    expect(answer).toMatchObject({
      answer: 'Cafes has the most leads without a website: 1.', table: { columns: ['category', 'leads'], rows: [['Cafes', '1']] },
      servedModel: 'mistral-small-2603', costUsd: 0.0104, requestId: 'req-9', segments: 1, leads: 1,
    });
  });

  it('rejects an empty or overlong question without a call', async () => {
    const gateway: PipelineGateway = { status: () => ({ models: { verify: 'x' } }), codeRun: async () => { throw new Error('no call expected'); } };
    await expect(askPipeline(db, gateway, '   ')).rejects.toThrow(/Type a question/);
    await expect(askPipeline(db, gateway, 'x'.repeat(301))).rejects.toThrow(/under 300/);
  });
});

describe('OtariGateway.codeRun', () => {
  it('calls /responses with code_interpreter and Otari-Code-Execution: otari, and returns code and output', async () => {
    const sent: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({
        id: 'resp_1', object: 'response', created_at: 0, status: 'completed', model: 'faber-verify', output_text: 'Cafes: 76.',
        output: [
          { type: 'code_interpreter_call', id: 'ci_1', status: 'completed', container_id: 'c1', code: 'print(76)', outputs: [{ type: 'logs', logs: '76\n' }] },
          { type: 'message', id: 'm1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Cafes: 76.', annotations: [] }] },
        ],
        usage: { input_tokens: 900, output_tokens: 120, total_tokens: 1020, output_tokens_details: { reasoning_tokens: 0 }, cost_usd: '0.010180' },
      }), { status: 200, headers: { 'content-type': 'application/json', 'otari-model': 'mistral-small-2603', 'otari-provider': 'mistral', 'otari-request-id': 'req-ci', 'otari-container-id': 'c1' } });
    };
    const gateway = new OtariGateway(() => db, () => ({ apiKey: 'test-key', keySource: 'settings', baseUrl: OTARI_EU_BASE_URL, models: { ...DEFAULT_MODELS } }),
      (options) => createOtariClient({ ...options, fetch: fakeFetch }));

    const run = await gateway.codeRun({ feature: 'pipeline_question', model: 'faber-verify', instructions: 'compute', input: 'Question: x', maxOutputTokens: 1500 });

    expect(sent[0].url).toBe(`${OTARI_EU_BASE_URL}/responses`);
    expect(sent[0].headers.get('otari-code-execution')).toBe('otari');
    expect(sent[0].headers.get('otari-key')).toBe('test-key');
    expect(sent[0].headers.has('authorization')).toBe(false);
    expect(sent[0].body).toMatchObject({ model: 'faber-verify', tools: [{ type: 'code_interpreter', container: { type: 'auto' } }], max_output_tokens: 1500 });
    expect(run).toMatchObject({ text: 'Cafes: 76.', code: ['print(76)'], logs: '76\n' });
    expect(run.activity).toMatchObject({ feature: 'pipeline_question', model_served: 'mistral-small-2603', request_id: 'req-ci', prompt_tokens: 900, completion_tokens: 120, cost_usd: 0.01018, outcome: 'ok' });
  });
});
