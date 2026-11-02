// Channel names only — no imports — so the sandboxed preload can bundle this file on its own.
// contract.ts defines the payload and response types for each name.

export const INVOKE_CHANNELS = [
  'app:info',
  'app:openLogs',

  'auth:status',
  'auth:onboard',
  'auth:login',
  'auth:lock',
  'auth:changePassword',
  'auth:recover',
  'auth:regenerateRecovery',
  'auth:saveRecoveryCode',

  'settings:get',
  'settings:getAppearance',
  'settings:update',
  'settings:setSecret',

  'ai:status',
  'ai:testConnection',
  'ai:activity',
  'ai:spend',
  'ai:checkWebsite',
  'ai:startWebsiteChecks',
  'ai:stopWebsiteChecks',
  'ai:websiteCheckState',
  'ai:suggestNameMatch',
  'ai:draftPitch',

  'backup:list',
  'backup:create',
  'backup:openFolder',
  'backup:chooseFolder',
  'backup:resetFolder',
  'backup:pickRestoreFile',
  'backup:inspect',
  'backup:restore',
  'data:factoryReset',

  'leads:list',
  'leads:facets',
  'leads:get',
  'leads:activity',
  'leads:create',
  'leads:update',
  'leads:move',
  'leads:setStar',
  'leads:setTags',
  'leads:bulk',
  'leads:updateNotes',
  'leads:delete',
  'leads:markNotAFit',
  'leads:unflagChain',
  'leads:resolveReview',
  'leads:logContact',
  'leads:setWebsiteStatus',

  'chains:list',
  'chains:add',
  'chains:remove',

  'projects:list',
  'projects:create',
  'projects:update',
  'projects:updateStage',
  'projects:addWorkLog',
  'projects:delete',

  'payments:list',
  'payments:create',
  'payments:markReceived',
  'payments:delete',

  'reminders:list',
  'reminders:create',
  'reminders:markDone',
  'reminders:delete',
  'reminders:entities',

  'dashboard:get',

  'discover:geocode',
  'discover:run',
  'discover:getState',

  'enrichment:run',
  'enrichment:stop',
  'enrichment:retry',
  'enrichment:skip',
  'enrichment:getState',

  'search:query',

  'trash:list',
  'trash:restore',
  'trash:purge',

  'export:csv',

  'notifications:list',
  'notifications:markAllRead',
] as const;

export const EVENT_CHANNELS = [
  'discover:log',
  'discover:state',
  'enrichment:log',
  'enrichment:captcha',
  'enrichment:complete',
  'enrichment:state',
  'websiteCheck:state',
  'notifications:new',
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
export type EventChannel = (typeof EVENT_CHANNELS)[number];
