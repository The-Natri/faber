import type { BrowserWindow } from 'electron';
import type { EventChannel } from '../../shared/ipc/channels.ts';
import type { EventPayload } from '../../shared/ipc/contract.ts';

let target: () => BrowserWindow | null = () => null;

export function setEventTarget(getWindow: () => BrowserWindow | null) {
  target = getWindow;
}

// Sends a typed event to the renderer; silently dropped if the window is gone
export function emit<E extends EventChannel>(channel: E, ...payload: EventPayload<E> extends void ? [] : [EventPayload<E>]) {
  const window = target();
  if (window && !window.isDestroyed()) window.webContents.send(channel, ...payload);
}
