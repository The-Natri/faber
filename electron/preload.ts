import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../shared/ipc/channels.ts';

// Sandboxed preload: exposes only window.faber, and only for the channels in the contract.
const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const eventsAllowed = new Set<string>(EVENT_CHANNELS);

contextBridge.exposeInMainWorld('faber', {
  invoke: (channel: string, payload?: unknown) => {
    if (!invokeAllowed.has(channel)) {
      return Promise.resolve({ ok: false, error: { code: 'VALIDATION', message: `Unknown channel ${channel}` } });
    }
    return ipcRenderer.invoke(channel, payload);
  },
  // Returns an unsubscribe function
  on: (channel: string, callback: (payload: unknown) => void) => {
    if (!eventsAllowed.has(channel)) return () => {};
    const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});
