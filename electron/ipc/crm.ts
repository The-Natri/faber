import type { AppContext } from '../context.ts';
import type { PartialHandlerMap } from './core.ts';
import { addPattern, listPatterns, markNotAFit, removePattern, unflagLead } from '../services/leads/chains.ts';
import {
  bulkLeads, createLead, getLead, leadActivity, leadFacets, listLeads, moveLead, setStarred, setTags, softDeleteLead,
  updateLead, updateLeadNotes,
} from '../services/leads/index.ts';
import { addWorkLog, createProject, listProjects, softDeleteProject, updateProject, updateProjectStage } from '../services/projects/index.ts';
import { createPayment, listPayments, markPaymentReceived, softDeletePayment } from '../services/payments/index.ts';
import { createReminder, listReminders, markReminderDone, reminderEntities, softDeleteReminder } from '../services/reminders/index.ts';
import { getDashboard } from '../services/dashboard/index.ts';

export function leadsHandlers(ctx: AppContext) {
  return {
    'leads:list': (filters) => listLeads(ctx.db(), filters),
    'leads:facets': () => leadFacets(ctx.db()),
    'leads:get': ({ id }) => getLead(ctx.db(), id),
    'leads:activity': ({ id }) => leadActivity(ctx.db(), id),
    'leads:create': (values) => createLead(ctx.db(), values),
    'leads:update': ({ id, values }) => updateLead(ctx.db(), id, values),
    'leads:move': ({ id, to, lostReason, note }) => moveLead(ctx.db(), id, to, { lostReason, note }),
    'leads:setStar': ({ id, starred }) => setStarred(ctx.db(), id, starred),
    'leads:setTags': ({ id, tags }) => setTags(ctx.db(), id, tags),
    'leads:bulk': ({ ids, action }) => bulkLeads(ctx.db(), ids, action),
    'leads:updateNotes': ({ id, notes }) => updateLeadNotes(ctx.db(), id, notes),
    'leads:delete': ({ id }) => softDeleteLead(ctx.db(), id),
    'leads:markNotAFit': ({ id, addToBlocklist }) => markNotAFit(ctx.db(), id, addToBlocklist),
    'leads:unflagChain': ({ id }) => unflagLead(ctx.db(), id),
    'chains:list': () => listPatterns(ctx.db()),
    'chains:add': ({ pattern }) => addPattern(ctx.db(), pattern),
    'chains:remove': ({ id }) => removePattern(ctx.db(), id),
  } satisfies PartialHandlerMap;
}

export function projectsHandlers(ctx: AppContext) {
  return {
    'projects:list': () => listProjects(ctx.db()),
    'projects:create': (data) => createProject(ctx.db(), data),
    'projects:update': ({ id, ...fields }) => updateProject(ctx.db(), id, fields),
    'projects:updateStage': ({ id, stage }) => updateProjectStage(ctx.db(), id, stage),
    'projects:addWorkLog': ({ project_id, entry }) => addWorkLog(ctx.db(), project_id, entry),
    'projects:delete': ({ id }) => softDeleteProject(ctx.db(), id),
  } satisfies PartialHandlerMap;
}

export function paymentsHandlers(ctx: AppContext) {
  return {
    'payments:list': () => listPayments(ctx.db()),
    'payments:create': (data) => createPayment(ctx.db(), data),
    'payments:markReceived': ({ id }) => markPaymentReceived(ctx.db(), id),
    'payments:delete': ({ id }) => softDeletePayment(ctx.db(), id),
  } satisfies PartialHandlerMap;
}

export function remindersHandlers(ctx: AppContext) {
  return {
    'reminders:list': () => listReminders(ctx.db()),
    'reminders:create': (data) => createReminder(ctx.db(), data),
    'reminders:markDone': ({ id }) => markReminderDone(ctx.db(), id),
    'reminders:delete': ({ id }) => softDeleteReminder(ctx.db(), id),
    'reminders:entities': () => reminderEntities(ctx.db()),
  } satisfies PartialHandlerMap;
}

export function dashboardHandlers(ctx: AppContext) {
  return {
    'dashboard:get': () => getDashboard(ctx.db()),
  } satisfies PartialHandlerMap;
}
