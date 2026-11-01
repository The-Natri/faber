import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import type { AppContext } from '../context.ts';
import type { PartialHandlerMap } from './core.ts';
import { log } from '../services/logger/index.ts';

const RECOVERY_FILE_LINES = (code: string) => [
  "Natri's Faber — recovery code",
  '',
  code,
  '',
  'Use it on the sign-in screen ("Forgot password?") to set a new password.',
  'Each code works once; Faber shows a new one after you use it.',
  'Keep this file somewhere private.',
  '',
];

export function authHandlers(ctx: AppContext) {
  return {
    'auth:status': () => ctx.auth.status(),
    'auth:onboard': ({ username, password }) => ctx.auth.onboard(username, password),
    'auth:login': async ({ username, password }) => {
      const result = await ctx.auth.login(username, password);
      log.info(`[Auth] Signed in as ${username.trim()}`);
      return result;
    },
    'auth:lock': () => ctx.auth.lock(),
    'auth:changePassword': ({ currentPassword, newPassword }) => ctx.auth.changePassword(currentPassword, newPassword),
    'auth:recover': ({ recoveryCode, newPassword }) => ctx.auth.recover(recoveryCode, newPassword),
    'auth:regenerateRecovery': ({ password }) => ctx.auth.regenerateRecovery(password),
    'auth:saveRecoveryCode': async ({ recoveryCode }) => {
      const options = {
        title: 'Save recovery code',
        defaultPath: path.join(app.getPath('documents'), 'faber-recovery-code.txt'),
        filters: [{ name: 'Text', extensions: ['txt'] }],
      };
      const window = ctx.window();
      const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { path: null };
      fs.writeFileSync(result.filePath, RECOVERY_FILE_LINES(recoveryCode).join('\r\n'));
      return { path: result.filePath };
    },
  } satisfies PartialHandlerMap;
}
