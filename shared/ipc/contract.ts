import { z } from 'zod';
import type { EventChannel, InvokeChannel } from './channels.ts';
import { LEAD_STATUSES, LOST_REASONS } from '../pipeline.ts';
import { SECRET_NAMES, SETTINGS_SECTIONS, type Appearance, type SettingsSection, type SettingsView } from '../settings.ts';
import type { AiActivityPage, AiConnectionTest, AiStatus, NameMatchSuggestion, PitchDraft, WebsiteCheckResult, WebsiteCheckState } from '../ai.ts';
import type {
  AppInfo, AppNotification, BackupOverview, BulkResult, ChainPattern, DashboardData, LeadActivity, LeadFacets, DiscoveryResult, DiscoveryState,
  EnrichmentComplete, EnrichmentState, EntityOption, ExportEntity, Lead, Payment, Project,
  ProjectForPayments, ProjectWithLog, Reminder, RestoreCandidate, SearchHit, TrashItem, TrashType, WorkLog,
} from '../types.ts';

// ---- Envelope ---------------------------------------------------------------

export type ErrorCode =
  | 'VALIDATION'      // payload failed the schema
  | 'LOCKED'          // the app is locked; sign in first
  | 'BAD_CREDENTIALS'
  | 'LOCKED_OUT'      // too many failed attempts
  | 'NOT_FOUND'
  | 'CONFLICT'        // the action doesn't fit the current state
  | 'UNAVAILABLE'     // a required external piece (browser, safeStorage, network) is missing
  | 'CANCELLED'
  | 'INTERNAL';

export interface IpcError {
  code: ErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

// ---- Shared field schemas ---------------------------------------------------

const id = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
const optionalDate = z.union([isoDate, z.literal('')]).nullable().optional();
const text = (max: number) => z.string().max(max);
const leadStatus = z.enum(LEAD_STATUSES);
const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);
const leadInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  category: optionalText(60),
  phone: optionalText(30),
  address: optionalText(300),
  city: optionalText(100),
  owner_name: optionalText(100),
  best_time: optionalText(100),
  website_url: z.union([z.literal(''), z.null(), z.url({ protocol: /^https?$/, message: 'Website should start with http:// or https://' })]).default(null),
  notes: optionalText(10000),
});
const money = z.number().finite().nonnegative();
const projectStage = z.enum(['ongoing', 'maintenance', 'completed']);
const none = z.undefined();

export const PASSWORD_MIN_LENGTH = 10;
const newPassword = z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(200);
const username = z.string().trim().min(1, 'Enter a username').max(60);

// ---- Request schemas (validated in main) ------------------------------------

export const requestSchemas = {
  'app:info': none,
  'app:openLogs': none,

  'auth:status': none,
  'auth:onboard': z.object({ username, password: newPassword }),
  'auth:login': z.object({ username: z.string().max(60), password: z.string().max(200) }),
  'auth:lock': none,
  'auth:changePassword': z.object({ currentPassword: z.string().max(200), newPassword }),
  'auth:recover': z.object({ recoveryCode: z.string().min(1).max(64), newPassword }),
  'auth:regenerateRecovery': z.object({ password: z.string().max(200) }),
  'auth:saveRecoveryCode': z.object({ recoveryCode: z.string().min(1).max(64) }),

  'settings:get': none,
  'settings:getAppearance': none,
  'settings:update': z.object({
    section: z.enum(SETTINGS_SECTIONS as [SettingsSection, ...SettingsSection[]]),
    values: z.record(z.string(), z.unknown()),
  }),
  'settings:setSecret': z.object({ name: z.enum(SECRET_NAMES), value: z.string().max(500).nullable() }),

  'ai:status': none,
  // Costs a fraction of a cent: a free model list, then one 8-token call through Model A
  'ai:testConnection': none,
  'ai:activity': z.object({ limit: z.number().int().min(1).max(1000).default(200) }),
  // About $0.011 per lead without a website_url (one web search), about $0.001 with one
  'ai:checkWebsite': z.object({ leadId: id }),
  'ai:startWebsiteChecks': z.union([
    z.object({ count: z.number().int().min(1).max(20) }),
    z.object({ leadIds: z.array(id).min(1).max(20) }),
  ]),
  'ai:stopWebsiteChecks': none,
  'ai:websiteCheckState': none,
  // Suggests only; leads:resolveReview applies what the user decides
  'ai:suggestNameMatch': z.object({ leadId: id }),
  // Model B through faber-pitch, about $0.0003; the template when Otari fails or a guardrail blocks
  'ai:draftPitch': z.object({ leadId: id }),

  'backup:list': none,
  'backup:create': none,
  'backup:openFolder': none,
  'backup:chooseFolder': none,
  'backup:resetFolder': none,
  'backup:pickRestoreFile': none,
  'backup:inspect': z.object({ name: z.string().regex(/^[\w.-]+\.db$/, 'Not a backup file name') }),
  'backup:restore': z.object({ file: z.string().min(1) }),
  'data:factoryReset': z.object({ confirmText: z.literal('RESET FABER'), password: z.string().max(200) }),

  // Every filter has a default, so callers send only what they change
  'leads:list': z.object({
    search: z.string().max(200).default(''),
    stages: z.array(leadStatus).max(LEAD_STATUSES.length).default([]),
    category: z.string().max(60).nullable().default(null),
    city: z.string().max(100).nullable().default(null),
    scoreMin: z.number().min(0).max(100).default(0),
    scoreMax: z.number().min(0).max(100).default(100),
    tags: z.array(z.string().max(30)).max(20).default([]),
    starredOnly: z.boolean().default(false),
    websiteStatus: z.enum(['none', 'found', 'outdated', 'unknown']).nullable().default(null),
    showChains: z.boolean().default(false),
    sort: z.enum(['score', 'name', 'newest', 'last_contacted']).default('score'),
  }),
  'leads:facets': none,
  'leads:get': z.object({ id }),
  'leads:activity': z.object({ id }),
  'leads:create': leadInput,
  'leads:update': z.object({ id, values: leadInput }),
  'leads:move': z.object({
    id,
    to: leadStatus,
    lostReason: z.enum(LOST_REASONS).optional(),
    note: z.string().trim().max(500).optional(),
  }),
  'leads:setStar': z.object({ id, starred: z.boolean() }),
  'leads:setTags': z.object({ id, tags: z.array(z.string().trim().min(1).max(30)).max(20) }),
  'leads:bulk': z.object({
    ids: z.array(id).min(1).max(1000),
    action: z.discriminatedUnion('type', [
      // Won stays one lead at a time: each one creates a project
      z.object({ type: z.literal('move'), to: leadStatus.exclude(['won']), lostReason: z.enum(LOST_REASONS).optional(), note: z.string().trim().max(500).optional() }),
      z.object({ type: z.literal('tag'), tag: z.string().trim().min(1).max(30), add: z.boolean() }),
      z.object({ type: z.literal('star'), starred: z.boolean() }),
      z.object({ type: z.literal('followUp'), dueDate: isoDate, message: z.string().trim().min(1, 'Message is required').max(1000) }),
      z.object({ type: z.literal('delete') }),
      z.object({ type: z.literal('restore') }),
    ]),
  }),
  'leads:updateNotes': z.object({ id, notes: text(10000) }),
  'leads:delete': z.object({ id }),
  'leads:markNotAFit': z.object({ id, addToBlocklist: z.boolean() }),
  'leads:unflagChain': z.object({ id }),
  'leads:resolveReview': z.object({ id, decision: z.enum(['match', 'no_match']), name: z.string().trim().max(200).optional() }),
  // Only after the user confirms "Sent?"
  'leads:logContact': z.object({ id, channel: z.literal('whatsapp'), note: z.string().max(2000).nullable().default(null) }),

  'chains:list': none,
  'chains:add': z.object({ pattern: z.string().trim().min(1).max(100) }),
  'chains:remove': z.object({ id }),

  'projects:list': none,
  'projects:create': z.object({
    name: z.string().trim().min(1, 'Project name is required').max(200),
    category: text(60).nullable().optional(),
    phone: text(40).nullable().optional(),
    scope: text(5000).nullable().optional(),
    payment_agreed: money.nullable().optional(),
    deadline: optionalDate,
    notes: text(10000).nullable().optional(),
  }),
  'projects:update': z.object({
    id,
    name: z.string().trim().min(1).max(200).optional(),
    category: text(60).nullable().optional(),
    phone: text(40).nullable().optional(),
    scope: text(5000).nullable().optional(),
    stage: projectStage.optional(),
    payment_agreed: money.nullable().optional(),
    payment_received: money.nullable().optional(),
    deadline: optionalDate,
    notes: text(10000).nullable().optional(),
  }),
  'projects:updateStage': z.object({ id, stage: projectStage }),
  'projects:addWorkLog': z.object({ project_id: id, entry: z.string().trim().min(1).max(2000) }),
  'projects:delete': z.object({ id }),

  'payments:list': none,
  'payments:create': z.object({
    project_id: id,
    amount: z.number().finite().positive('Valid amount is required'),
    type: z.enum(['advance', 'milestone', 'final']),
    status: z.enum(['pending', 'received']),
    due_date: optionalDate,
    notes: text(1000).nullable().optional(),
  }),
  'payments:markReceived': z.object({ id }),
  'payments:delete': z.object({ id }),

  'reminders:list': none,
  'reminders:create': z.object({
    entity_type: z.enum(['lead', 'project']),
    entity_id: id,
    message: z.string().trim().min(1, 'Message is required').max(1000),
    due_date: isoDate,
  }),
  'reminders:markDone': z.object({ id }),
  'reminders:delete': z.object({ id }),
  'reminders:entities': none,

  'dashboard:get': none,

  'discover:geocode': z.object({ location: z.string().trim().min(1, 'Location is required').max(200) }),
  'discover:run': z.object({
    location: z.string().trim().min(1, 'Please enter a location').max(200),
    radiusKm: z.number().int().min(1).max(50),
    categories: z.array(z.string()).min(1, 'Please select at least one category'),
  }),
  'discover:getState': none,

  'enrichment:run': none,
  'enrichment:stop': none,
  'enrichment:retry': none,
  'enrichment:skip': none,
  'enrichment:getState': none,

  'search:query': z.object({ q: z.string().max(100) }),

  'trash:list': none,
  'trash:restore': z.object({ type: z.enum(['lead', 'project', 'payment', 'reminder']), id }),
  'trash:purge': z.object({ type: z.enum(['lead', 'project', 'payment', 'reminder']), id }),

  // ids: only these rows (bulk export of selected leads)
  'export:csv': z.object({ entity: z.enum(['leads', 'projects', 'payments', 'reminders']), ids: z.array(id).max(5000).optional() }),

  'notifications:list': none,
  'notifications:markAllRead': none,
} satisfies Record<InvokeChannel, z.ZodType>;

// Channels that work while the app is locked (everything else needs a signed-in session)
export const PUBLIC_CHANNELS: ReadonlySet<InvokeChannel> = new Set<InvokeChannel>([
  'app:info',
  'auth:status',
  'auth:onboard',
  'auth:login',
  'auth:recover',
  'auth:saveRecoveryCode',
  'settings:getAppearance',
]);

// ---- Responses --------------------------------------------------------------

export type AuthStatus =
  | { state: 'onboarding' }
  | { state: 'locked'; username: string; lockedUntil: string | null }
  | { state: 'mustChangePassword'; username: string }
  | { state: 'unlocked'; username: string };

export interface Responses {
  'app:info': AppInfo;
  'app:openLogs': void;

  'auth:status': AuthStatus;
  'auth:onboard': { recoveryCode: string };
  'auth:login': { mustChangePassword: boolean };
  'auth:lock': void;
  'auth:changePassword': { recoveryCode: string | null };
  'auth:recover': { username: string; recoveryCode: string };
  'auth:regenerateRecovery': { recoveryCode: string };
  'auth:saveRecoveryCode': { path: string | null };

  'settings:get': SettingsView;
  'settings:getAppearance': Appearance;
  'settings:update': SettingsView;
  'settings:setSecret': SettingsView;

  'ai:status': AiStatus;
  'ai:testConnection': AiConnectionTest;
  'ai:activity': AiActivityPage;
  'ai:checkWebsite': WebsiteCheckResult;
  'ai:startWebsiteChecks': void;
  'ai:stopWebsiteChecks': void;
  'ai:websiteCheckState': WebsiteCheckState;
  'ai:suggestNameMatch': NameMatchSuggestion;
  'ai:draftPitch': PitchDraft;

  'backup:list': BackupOverview;
  'backup:create': { name: string };
  'backup:openFolder': void;
  'backup:chooseFolder': BackupOverview;
  'backup:resetFolder': BackupOverview;
  'backup:pickRestoreFile': RestoreCandidate | null;
  'backup:inspect': RestoreCandidate;
  'backup:restore': void;
  'data:factoryReset': void;

  'leads:list': Lead[];
  'leads:facets': LeadFacets;
  'leads:get': Lead;
  'leads:activity': LeadActivity[];
  'leads:create': { lead: Lead; flaggedAsChain: boolean };
  'leads:update': Lead;
  'leads:move': { project_id: number | null };
  'leads:setStar': void;
  'leads:setTags': void;
  'leads:bulk': BulkResult;
  'leads:updateNotes': void;
  'leads:delete': void;
  'leads:markNotAFit': { alsoFlagged: number };
  'leads:unflagChain': void;
  'leads:resolveReview': Lead;
  'leads:logContact': Lead;

  'chains:list': ChainPattern[];
  'chains:add': { flagged: number };
  'chains:remove': { unflagged: number };

  'projects:list': ProjectWithLog[];
  'projects:create': Project;
  'projects:update': void;
  'projects:updateStage': void;
  'projects:addWorkLog': WorkLog;
  'projects:delete': void;

  'payments:list': { payments: Payment[]; projects: ProjectForPayments[] };
  'payments:create': Payment;
  'payments:markReceived': void;
  'payments:delete': void;

  'reminders:list': Reminder[];
  'reminders:create': Reminder;
  'reminders:markDone': void;
  'reminders:delete': void;
  'reminders:entities': { leads: EntityOption[]; projects: EntityOption[] };

  'dashboard:get': DashboardData;

  'discover:geocode': { lat: number; lon: number; displayName: string };
  'discover:run': DiscoveryResult;
  'discover:getState': DiscoveryState;

  'enrichment:run': void;
  'enrichment:stop': void;
  'enrichment:retry': void;
  'enrichment:skip': void;
  'enrichment:getState': EnrichmentState;

  'search:query': SearchHit[];

  'trash:list': TrashItem[];
  'trash:restore': void;
  'trash:purge': void;

  'export:csv': { path: string | null; rows: number };

  'notifications:list': AppNotification[];
  'notifications:markAllRead': void;
}

export type Request<C extends InvokeChannel> = z.input<(typeof requestSchemas)[C]>;
export type ParsedRequest<C extends InvokeChannel> = z.output<(typeof requestSchemas)[C]>;
export type Response<C extends InvokeChannel> = Responses[C];

// ---- Events (main → renderer) ----------------------------------------------

export interface Events {
  'discover:log': string;
  'discover:state': DiscoveryState;
  'enrichment:log': string;
  'enrichment:captcha': void;
  'enrichment:complete': EnrichmentComplete;
  'enrichment:state': EnrichmentState;
  'websiteCheck:state': WebsiteCheckState;
  'notifications:new': AppNotification;
}

export type EventPayload<E extends EventChannel> = Events[E];

export type { TrashType, ExportEntity };
