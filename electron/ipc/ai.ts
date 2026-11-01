import type { AppContext } from '../context.ts';
import { listAiActivity } from '../services/ai/activity.ts';
import type { PartialHandlerMap } from './core.ts';

// AI through Otari. The renderer sees status, results and the activity log, never the key.
export function aiHandlers(ctx: AppContext) {
  return {
    'ai:status': () => ctx.ai.status(),
    'ai:testConnection': () => ctx.ai.testConnection(),
    'ai:activity': ({ limit }) => listAiActivity(ctx.db(), limit),
  } satisfies PartialHandlerMap;
}
