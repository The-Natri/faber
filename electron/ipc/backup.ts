import path from 'path';
import { dialog, shell, type OpenDialogOptions } from 'electron';
import type { AppContext } from '../context.ts';
import { AppError, type PartialHandlerMap } from './core.ts';
import { createBackup, pruneBackups } from '../services/backup/index.ts';
import { inspectRestoreFile, listAllBackups, restoreDatabase, wipeDatabase } from '../services/backup/restore.ts';
import { MIGRATIONS } from '../db/migrations/index.ts';
import { log } from '../services/logger/index.ts';
import type { BackupOverview } from '../../shared/types.ts';

export function backupHandlers(ctx: AppContext) {
  const overview = (): BackupOverview => {
    const folder = ctx.backupDir();
    return {
      folder,
      is_default_folder: folder === ctx.defaultBackupDir,
      keep: ctx.settings.get('backups').keep,
      backups: listAllBackups(folder),
    };
  };

  const openDialog = async (options: OpenDialogOptions) => {
    const window = ctx.window();
    return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
  };

  // Restoring or wiping closes the database, so nothing else may be using it
  const assertIdle = () => {
    if (ctx.discovery.getState().running || ctx.enrichment.getState().running) {
      throw new AppError('CONFLICT', 'Wait for discovery and enrichment to finish first.');
    }
  };

  return {
    'backup:list': () => overview(),
    'backup:create': async () => {
      const file = await createBackup(ctx.db(), ctx.backupDir(), 'manual');
      pruneBackups(ctx.backupDir(), ctx.settings.get('backups').keep);
      return { name: path.basename(file) };
    },
    'backup:openFolder': async () => {
      await shell.openPath(ctx.backupDir());
    },
    'backup:chooseFolder': async () => {
      const result = await openDialog({ title: 'Choose a backup folder', properties: ['openDirectory', 'createDirectory'] });
      if (!result.canceled && result.filePaths[0]) ctx.settings.update('backups', { folder: result.filePaths[0] });
      return overview();
    },
    'backup:resetFolder': () => {
      ctx.settings.update('backups', { folder: null });
      return overview();
    },
    'backup:pickRestoreFile': async () => {
      const result = await openDialog({
        title: 'Restore from backup',
        defaultPath: ctx.backupDir(),
        properties: ['openFile'],
        filters: [{ name: 'Faber backup', extensions: ['db'] }],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return inspectRestoreFile(result.filePaths[0], MIGRATIONS.length);
    },
    // Restore straight from a row in the backups list: only names listed in the backup folder
    'backup:inspect': ({ name }) => {
      const folder = ctx.backupDir();
      if (!listAllBackups(folder).some((b) => b.name === name)) {
        throw new AppError('NOT_FOUND', 'That backup is no longer in the backup folder.');
      }
      return inspectRestoreFile(path.join(folder, name), MIGRATIONS.length);
    },
    'backup:restore': async ({ file }) => {
      assertIdle();
      await restoreDatabase(ctx.db(), ctx.dbPath, file, ctx.backupDir(), MIGRATIONS.length);
      log.info(`[Backup] Restored from ${file}; relaunching`);
      ctx.relaunch();
    },
    'data:factoryReset': async ({ password }) => {
      assertIdle();
      await ctx.auth.verifyPassword(password);
      const finalBackup = await wipeDatabase(ctx.db(), ctx.dbPath, ctx.backupDir());
      log.info(`[Data] Factory reset; final backup ${finalBackup}; relaunching`);
      ctx.relaunch();
    },
  } satisfies PartialHandlerMap;
}
