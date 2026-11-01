import type { EventChannel, InvokeChannel } from '../../shared/ipc/channels.ts';
import type { ErrorCode, EventPayload, IpcResult, Request, Response } from '../../shared/ipc/contract.ts';

declare global {
  interface Window {
    faber: {
      invoke(channel: string, payload?: unknown): Promise<IpcResult<unknown>>;
      on(channel: string, callback: (payload: unknown) => void): () => void;
    };
  }
}

// Thrown by call() when main answers { ok: false }
export class IpcCallError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

type Args<C extends InvokeChannel> = Request<C> extends undefined ? [] : [payload: Request<C>];

// Typed call into the main process. Resolves with the data or throws IpcCallError.
export async function call<C extends InvokeChannel>(channel: C, ...args: Args<C>): Promise<Response<C>> {
  const result = await window.faber.invoke(channel, args[0]);
  if (!result.ok) throw new IpcCallError(result.error.code, result.error.message);
  return result.data as Response<C>;
}

// Typed event subscription; returns the unsubscribe function (use it as the effect cleanup)
export function subscribe<E extends EventChannel>(channel: E, callback: (payload: EventPayload<E>) => void): () => void {
  return window.faber.on(channel, (payload) => callback(payload as EventPayload<E>));
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
