import type { AppContext } from '../context.ts';
import type { PartialHandlerMap } from './core.ts';
import { geocode } from '../services/discovery/index.ts';

export function discoveryHandlers(ctx: AppContext) {
  return {
    'discover:geocode': ({ location }) => geocode(location),
    'discover:run': ({ location, radiusKm, categories }) => ctx.discovery.run(location, radiusKm, categories),
    'discover:getState': () => ctx.discovery.getState(),
  } satisfies PartialHandlerMap;
}

export function enrichmentHandlers(ctx: AppContext) {
  return {
    'enrichment:run': () => ctx.enrichment.start(),
    'enrichment:stop': () => ctx.enrichment.stop(),
    'enrichment:retry': () => ctx.enrichment.resolveCaptcha('retry'),
    'enrichment:skip': () => ctx.enrichment.resolveCaptcha('skip'),
    'enrichment:getState': () => ctx.enrichment.getState(),
  } satisfies PartialHandlerMap;
}
