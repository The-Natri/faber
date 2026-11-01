import { app, shell } from 'electron';
import type { AppContext } from '../context.ts';
import type { PartialHandlerMap } from './core.ts';
import { logsDir } from '../services/logger/index.ts';

export function appHandlers(ctx: AppContext) {
  return {
    'app:info': () => ({
      version: app.getVersion(),
      is_dev: !app.isPackaged,
      user_data_path: ctx.userDataPath,
      logs_path: logsDir() ?? '',
    }),
    'app:openLogs': async () => {
      const dir = logsDir();
      if (dir) await shell.openPath(dir);
    },
  } satisfies PartialHandlerMap;
}
