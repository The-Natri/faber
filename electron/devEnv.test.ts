import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devEnvPath, loadDevEnv } from './devEnv.ts';

let dir: string;
let repo: string;
const saved = { FABER_ENV_PATH: process.env.FABER_ENV_PATH, FABER_TEST_VAR: process.env.FABER_TEST_VAR };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-devenv-'));
  repo = path.join(dir, 'natris-faber');
  fs.mkdirSync(repo);
  delete process.env.FABER_ENV_PATH;
  delete process.env.FABER_TEST_VAR;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('dev env loader', () => {
  it('defaults to ../faber-private/.env beside the repo, outside it', () => {
    expect(devEnvPath(repo)).toBe(path.join(dir, 'faber-private', '.env'));
  });

  it('uses FABER_ENV_PATH when set', () => {
    const custom = path.join(dir, 'elsewhere.env');
    expect(devEnvPath(repo, custom)).toBe(custom);
  });

  it('fails with the expected path when the file is missing, even if the repo has a .env', () => {
    fs.writeFileSync(path.join(repo, '.env'), 'FABER_TEST_VAR=from-repo\n');
    expect(() => loadDevEnv(repo)).toThrow(path.join(dir, 'faber-private', '.env'));
  });

  it('returns values and copies only the exposed names into process.env', () => {
    fs.mkdirSync(path.join(dir, 'faber-private'));
    fs.writeFileSync(path.join(dir, 'faber-private', '.env'), 'FABER_TEST_VAR=one\nFABER_HIDDEN=two\n');
    const values = loadDevEnv(repo, ['FABER_TEST_VAR']);
    expect(values).toEqual({ FABER_TEST_VAR: 'one', FABER_HIDDEN: 'two' });
    expect(process.env.FABER_TEST_VAR).toBe('one');
    expect(process.env.FABER_HIDDEN).toBeUndefined();
  });

  it('never overwrites a variable already set in the environment', () => {
    process.env.FABER_TEST_VAR = 'shell';
    fs.mkdirSync(path.join(dir, 'faber-private'));
    fs.writeFileSync(path.join(dir, 'faber-private', '.env'), 'FABER_TEST_VAR=file\n');
    loadDevEnv(repo, ['FABER_TEST_VAR']);
    expect(process.env.FABER_TEST_VAR).toBe('shell');
  });
});
