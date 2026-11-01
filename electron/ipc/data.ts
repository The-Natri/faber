import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import type { AppContext } from '../context.ts';
import type { PartialHandlerMap } from './core.ts';
import { search } from '../services/search/index.ts';
import { listTrash, purgeItem, restoreItem } from '../services/trash/index.ts';
import { exportRows, toCsv } from '../services/export/index.ts';
import { fileStamp } from '../services/backup/index.ts';

export function searchHandlers(ctx: AppContext) {
  return {
    'search:query': ({ q }) => search(ctx.db(), q),
  } satisfies PartialHandlerMap;
}

export function trashHandlers(ctx: AppContext) {
  return {
    'trash:list': () => listTrash(ctx.db()),
    'trash:restore': ({ type, id }) => restoreItem(ctx.db(), type, id),
    'trash:purge': ({ type, id }) => purgeItem(ctx.db(), type, id),
  } satisfies PartialHandlerMap;
}

export function exportHandlers(ctx: AppContext) {
  return {
    'export:csv': async ({ entity, ids }) => {
      const { columns, rows } = exportRows(ctx.db(), entity, ids);
      const options = {
        title: `Export ${entity} as CSV`,
        defaultPath: path.join(app.getPath('documents'), `faber-${entity}-${fileStamp().slice(0, 8)}.csv`),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      };
      const window = ctx.window();
      const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { path: null, rows: 0 };
      fs.writeFileSync(result.filePath, toCsv(columns, rows), 'utf8');
      return { path: result.filePath, rows: rows.length };
    },
  } satisfies PartialHandlerMap;
}

export function notificationsHandlers(ctx: AppContext) {
  return {
    'notifications:list': () => ctx.notifications.list(),
    'notifications:markAllRead': () => ctx.notifications.markAllRead(),
  } satisfies PartialHandlerMap;
}
