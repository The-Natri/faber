import type { AppContext } from '../context.ts';
import type { PartialHandlerMap } from './core.ts';

export function settingsHandlers(ctx: AppContext) {
  return {
    'settings:get': () => ctx.settings.view(),
    'settings:getAppearance': () => ctx.settings.get('appearance'),
    'settings:update': ({ section, values }) => ctx.settings.update(section, values),
    'settings:setSecret': ({ name, value }) => ctx.settings.setSecret(name, value),
  } satisfies PartialHandlerMap;
}
