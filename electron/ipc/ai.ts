import type { AppContext } from '../context.ts';
import { listAiActivity } from '../services/ai/activity.ts';
import { suggestNameMatch } from '../services/ai/nameMatch.ts';
import { draftPitch } from '../services/ai/pitch.ts';
import type { PartialHandlerMap } from './core.ts';

// AI through Otari. The renderer sees status, results and the activity log, never the key.
export function aiHandlers(ctx: AppContext) {
  return {
    'ai:status': () => ctx.ai.status(),
    'ai:testConnection': () => ctx.ai.testConnection(),
    'ai:activity': ({ limit }) => listAiActivity(ctx.db(), limit),
    'ai:checkWebsite': ({ leadId }) => ctx.websiteChecks.checkOne(leadId),
    // Returns once the batch has started; progress arrives as websiteCheck:state events
    'ai:startWebsiteChecks': (request) => { void ctx.websiteChecks.start(request); },
    'ai:stopWebsiteChecks': () => ctx.websiteChecks.stop(),
    'ai:websiteCheckState': () => ctx.websiteChecks.getState(),
    'ai:suggestNameMatch': ({ leadId }) => suggestNameMatch(ctx.db(), ctx.ai, leadId),
    'ai:draftPitch': ({ leadId }) => draftPitch(ctx.db(), ctx.ai, leadId, { profile: ctx.settings.get('profile'), outreach: ctx.settings.get('outreach') }),
  } satisfies PartialHandlerMap;
}
