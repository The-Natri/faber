import { describe, expect, it } from 'vitest';
import { AppError, dispatch, isAllowed, type HandlerMap } from './core.ts';

const handlers = {
  'leads:updateNotes': ({ id, notes }: { id: number; notes: string }) => {
    if (id === 404) throw new AppError('NOT_FOUND', 'Lead 404 not found');
    return void notes;
  },
  'leads:list': () => [],
  'auth:status': () => ({ state: 'locked', username: 'owner', lockedUntil: null }),
  'auth:changePassword': () => undefined,
  'dashboard:get': () => { throw new Error('disk on fire'); },
} as unknown as HandlerMap;

describe('dispatch', () => {
  it('wraps results in the { ok, data } envelope', async () => {
    expect(await dispatch(handlers, 'leads:list', { showChains: false }, 'unlocked')).toEqual({ ok: true, data: [] });
  });

  it('rejects payloads that fail the schema, naming the field', async () => {
    const result = await dispatch(handlers, 'leads:updateNotes', { id: -1, notes: 'x' }, 'unlocked');
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: expect.stringContaining('id') } });
    expect(await dispatch(handlers, 'leads:list', { stages: ['nope'] }, 'unlocked')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('passes service errors through and hides nothing else', async () => {
    expect(await dispatch(handlers, 'leads:updateNotes', { id: 404, notes: '' }, 'unlocked'))
      .toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Lead 404 not found' } });
    expect(await dispatch(handlers, 'dashboard:get', undefined, 'unlocked'))
      .toEqual({ ok: false, error: { code: 'INTERNAL', message: 'disk on fire' } });
  });

  it('refuses data channels while locked but allows the public ones', async () => {
    expect(await dispatch(handlers, 'leads:list', { showChains: false }, 'locked')).toMatchObject({ ok: false, error: { code: 'LOCKED' } });
    expect(await dispatch(handlers, 'auth:status', undefined, 'locked')).toMatchObject({ ok: true });
  });

  it('only accepts plain backup file names for backup:inspect', async () => {
    const withInspect = { ...handlers, 'backup:inspect': () => 'ok' } as unknown as HandlerMap;
    for (const name of ['../faber.db', 'C:\\Users\\x\\faber.db', 'sub/faber-auto.db', 'notes.txt']) {
      expect(await dispatch(withInspect, 'backup:inspect', { name }, 'unlocked')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    expect(await dispatch(withInspect, 'backup:inspect', { name: 'faber-auto-20261012-080000.db' }, 'unlocked')).toEqual({ ok: true, data: 'ok' });
  });

  it('allows only the password change while one is forced', () => {
    expect(isAllowed('auth:changePassword', 'mustChangePassword')).toBe(true);
    expect(isAllowed('leads:list', 'mustChangePassword')).toBe(false);
    expect(isAllowed('leads:list', 'onboarding')).toBe(false);
    expect(isAllowed('auth:onboard', 'onboarding')).toBe(true);
  });
});
