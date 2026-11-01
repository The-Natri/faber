import { z } from 'zod';
import type { InvokeChannel } from '../../shared/ipc/channels.ts';
import {
  PUBLIC_CHANNELS, requestSchemas,
  type ErrorCode, type IpcResult, type ParsedRequest, type Response,
} from '../../shared/ipc/contract.ts';
import { log } from '../services/logger/index.ts';

// Thrown by services for errors the user should see as-is
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

export type Handler<C extends InvokeChannel> = (payload: ParsedRequest<C>) => Response<C> | Promise<Response<C>>;
export type HandlerMap = { [C in InvokeChannel]: Handler<C> };
export type PartialHandlerMap = { [C in InvokeChannel]?: Handler<C> };

export type SessionState = 'onboarding' | 'locked' | 'mustChangePassword' | 'unlocked';

// While a password change is forced, only that call (and the public ones) may run
const MUST_CHANGE_ALLOWED: ReadonlySet<InvokeChannel> = new Set<InvokeChannel>(['auth:changePassword', 'auth:lock']);

export function isAllowed(channel: InvokeChannel, session: SessionState): boolean {
  if (PUBLIC_CHANNELS.has(channel)) return true;
  if (session === 'unlocked') return true;
  return session === 'mustChangePassword' && MUST_CHANGE_ALLOWED.has(channel);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function dispatch<C extends InvokeChannel>(
  handlers: HandlerMap,
  channel: C,
  payload: unknown,
  session: SessionState
): Promise<IpcResult<Response<C>>> {
  if (!isAllowed(channel, session)) {
    return { ok: false, error: { code: 'LOCKED', message: 'Faber is locked. Sign in to continue.' } };
  }

  const parsed = (requestSchemas[channel] as z.ZodType).safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    return { ok: false, error: { code: 'VALIDATION', message: `${where}${first?.message ?? 'Invalid request'}` } };
  }

  try {
    const handler = handlers[channel] as Handler<C>;
    const data = await handler(parsed.data as ParsedRequest<C>);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    log.error(`[IPC] ${channel} failed: ${errorMessage(error)}`);
    return { ok: false, error: { code: 'INTERNAL', message: errorMessage(error) } };
  }
}
