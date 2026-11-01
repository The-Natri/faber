// Pipeline rules shared by main (enforces them) and the renderer (only offers allowed moves).

export const STAGES = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'won'] as const;
export const LEAD_STATUSES = [...STAGES, 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Shown in Codex by default; won and lost are a filter away
export const ACTIVE_STAGES: LeadStatus[] = ['new', 'contacted', 'replied', 'meeting', 'proposal'];

export const STAGE_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

export const LOST_REASONS = ['no_budget', 'has_website', 'not_interested', 'no_response', 'not_a_fit', 'other'] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const LOST_REASON_LABEL: Record<LostReason, string> = {
  no_budget: 'No budget',
  has_website: 'Already has a website',
  not_interested: 'Not interested',
  no_response: 'No response after follow-ups',
  not_a_fit: 'Chain / not a fit',
  other: 'Other',
};

// Allowed moves (§8.1): forward any number of steps, back one step, any active stage → lost,
// lost → new (reopen). Won is final: the lead has become a project.
export function canMove(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to || from === 'won') return false;
  if (from === 'lost') return to === 'new';
  if (to === 'lost') return true;
  const a = STAGES.indexOf(from);
  const b = STAGES.indexOf(to);
  return b > a || b === a - 1;
}

export function allowedMoves(from: LeadStatus): LeadStatus[] {
  return LEAD_STATUSES.filter((to) => canMove(from, to));
}

// v1 rows can carry an empty or unknown status; treat those as new
export function asStatus(value: string | null | undefined): LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value ?? '') ? (value as LeadStatus) : 'new';
}
