import { ipcMain } from 'electron';
import { INVOKE_CHANNELS } from '../../shared/ipc/channels.ts';
import type { AppContext } from '../context.ts';
import { dispatch, type HandlerMap } from './core.ts';
import { appHandlers } from './app.ts';
import { authHandlers } from './auth.ts';
import { settingsHandlers } from './settings.ts';
import { aiHandlers } from './ai.ts';
import { backupHandlers } from './backup.ts';
import { dashboardHandlers, leadsHandlers, paymentsHandlers, projectsHandlers, remindersHandlers } from './crm.ts';
import { discoveryHandlers, enrichmentHandlers } from './discovery.ts';
import { exportHandlers, notificationsHandlers, searchHandlers, trashHandlers } from './data.ts';

// Typed as HandlerMap, so a contract channel without a handler fails to compile
export function createHandlers(ctx: AppContext): HandlerMap {
  return {
    ...appHandlers(ctx),
    ...authHandlers(ctx),
    ...settingsHandlers(ctx),
    ...aiHandlers(ctx),
    ...backupHandlers(ctx),
    ...leadsHandlers(ctx),
    ...projectsHandlers(ctx),
    ...paymentsHandlers(ctx),
    ...remindersHandlers(ctx),
    ...dashboardHandlers(ctx),
    ...discoveryHandlers(ctx),
    ...enrichmentHandlers(ctx),
    ...searchHandlers(ctx),
    ...trashHandlers(ctx),
    ...exportHandlers(ctx),
    ...notificationsHandlers(ctx),
  };
}

export function registerIpc(ctx: AppContext, handlers: HandlerMap) {
  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, (event, payload: unknown) => {
      // Only our own window may call in
      if (event.sender !== ctx.window()?.webContents) {
        return { ok: false, error: { code: 'LOCKED', message: 'Unknown caller' } };
      }
      return dispatch(handlers, channel, payload, ctx.auth.sessionState());
    });
  }
}
