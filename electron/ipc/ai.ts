import type { AppContext } from '../context.ts';
import { listAiActivity, monthSpend } from '../services/ai/activity.ts';
import { suggestNameMatch } from '../services/ai/nameMatch.ts';
import { draftPitch } from '../services/ai/pitch.ts';
import { askPipeline } from '../services/ai/pipelineQuestion.ts';
import { auditWebsite } from '../services/ai/websiteAudit.ts';
import type { PartialHandlerMap } from './core.ts';

// AI through Otari. The renderer sees status, results and the activity log, never the key.
export function aiHandlers(ctx: AppContext) {
  return {
    'ai:status': () => ctx.ai.status(),
    'ai:testConnection': () => ctx.ai.testConnection(),
    'ai:activity': ({ limit }) => listAiActivity(ctx.db(), limit),
    'ai:spend': () => {
      const spend = monthSpend(ctx.db());
      const capUsd = ctx.settings.get('integrations').monthlyCapUsd;
      // Reached once even the smallest call (~$0.002) would go over it, as the gateway decides
      return { ...spend, capUsd, capReached: spend.totalUsd + 0.002 > capUsd };
    },
    'ai:checkWebsite': ({ leadId }) => ctx.websiteChecks.checkOne(leadId),
    'ai:auditWebsite': ({ leadId }) => auditWebsite(ctx.db(), ctx.ai, leadId, ctx.settings.get('integrations').auditMcpUrl),
    // Returns once the batch has started; progress arrives as websiteCheck:state events
    'ai:startWebsiteChecks': (request) => { void ctx.websiteChecks.start(request); },
    'ai:stopWebsiteChecks': () => ctx.websiteChecks.stop(),
    'ai:websiteCheckState': () => ctx.websiteChecks.getState(),
    'ai:suggestNameMatch': ({ leadId }) => suggestNameMatch(ctx.db(), ctx.ai, leadId),
    'ai:askPipeline': ({ question }) => askPipeline(ctx.db(), ctx.ai, question),
    'ai:draftPitch': ({ leadId, force }) => draftPitch(ctx.db(), ctx.ai, leadId, { profile: ctx.settings.get('profile'), outreach: ctx.settings.get('outreach') }, { force }),
  } satisfies PartialHandlerMap;
}
