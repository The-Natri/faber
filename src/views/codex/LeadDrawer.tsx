import { useState, type KeyboardEvent } from 'react';
import { Ban, Check, Globe, Pencil, Phone, Plus, RotateCcw, Sparkles, Star, Trash2, Undo2, X } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { cn, formatDateTime, usd } from '../../lib/format.ts';
import { useLoad } from '../../lib/useLoad.ts';
import { Button, Checkbox, ConfirmDialog, Drawer, IconButton, Input, ScoreSeal, Skeleton, StatusPill, Textarea, useToast } from '../../ui/index.ts';
import { canMove, LOST_REASON_LABEL, STAGE_LABEL, STAGES, type LeadStatus } from '../../../shared/pipeline.ts';
import type { Lead, LeadActivity } from '../../../shared/types.ts';
import type { NameMatchSuggestion } from '../../../shared/ai.ts';
import { VERDICT_LABEL, WebsiteBadge } from './WebsiteBadge.tsx';

export interface LeadActions {
  move: (lead: Lead, to: LeadStatus) => void;
  saveNotes: (lead: Lead, notes: string) => Promise<void>;
  remove: (lead: Lead) => void;
  markNotAFit: (lead: Lead, addToBlocklist: boolean) => Promise<void>;
  unflag: (lead: Lead) => Promise<void>;
  edit: (lead: Lead) => void;
  setStar: (lead: Lead, starred: boolean) => Promise<void>;
  setTags: (lead: Lead, tags: string[]) => Promise<void>;
  // Reloads the list and this lead after something changed it in main (an AI check, a name check)
  refresh: () => Promise<void>;
}

// Small pill for flagged leads in lists
export function ChainPill({ lead }: { lead: Lead }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-ink-muted">
      {lead.chain_reason === 'not_a_fit' ? 'Not a fit' : 'Chain'}
    </span>
  );
}

// Lead detail: stage stepper, details, tags, notes and the activity timeline.
// (Phase 2c reorganises this into tabs.)
export function LeadDrawer({ lead, onClose, actions, tagSuggestions }: {
  lead: Lead | null; onClose: () => void; actions: LeadActions; tagSuggestions: string[];
}) {
  return (
    <Drawer
      open={lead !== null}
      onOpenChange={(open) => !open && onClose()}
      title={lead?.name ?? ''}
      subtitle={lead ? `${lead.category || 'Uncategorized'} · ${lead.city || 'Unknown city'}` : undefined}
      pageKey={lead?.id}
    >
      {lead && <LeadDetail key={lead.id} lead={lead} actions={actions} tagSuggestions={tagSuggestions} />}
    </Drawer>
  );
}

function StageStepper({ lead, onMove }: { lead: Lead; onMove: (to: LeadStatus) => void }) {
  const current = lead.status;
  const reached = current === 'lost' ? -1 : STAGES.indexOf(current);
  return (
    <div className="flex flex-col gap-2.5">
      <ol className="grid grid-cols-3 gap-1.5" aria-label="Pipeline stage">
        {STAGES.map((stage, i) => {
          const allowed = canMove(current, stage);
          const isCurrent = stage === current;
          return (
            <li key={stage} className="min-w-0">
              <button
                type="button"
                disabled={!allowed}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => onMove(stage)}
                title={allowed ? `Move to ${STAGE_LABEL[stage]}` : undefined}
                className={cn(
                  'w-full truncate rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors',
                  isCurrent ? 'border-transparent text-white' : i < reached ? 'border-border text-ink' : 'border-border text-ink-muted',
                  allowed ? 'cursor-pointer hover:border-gold hover:text-ink' : 'cursor-default',
                )}
                style={isCurrent ? { backgroundColor: `var(--hue-${stage})` } : i < reached ? { backgroundColor: `color-mix(in oklab, var(--hue-${stage}) 16%, transparent)` } : undefined}
              >
                {STAGE_LABEL[stage]}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        {current === 'lost' ? (
          <>
            <StatusPill status="lost" />
            <span>{lead.lost_reason ? LOST_REASON_LABEL[lead.lost_reason] : 'No reason recorded'}</span>
            <Button size="sm" variant="secondary" className="ml-auto" icon={<RotateCcw className="size-3.5" />} onClick={() => onMove('new')}>Reopen</Button>
          </>
        ) : current === 'won' ? (
          <span>Won, and now a project in Forge.</span>
        ) : (
          <>
            <span>Forward any number of steps, or back one.</span>
            <Button size="sm" variant="danger" className="ml-auto" onClick={() => onMove('lost')}>Mark lost</Button>
          </>
        )}
      </div>
    </div>
  );
}

function TagEditor({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (tags: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const add = async () => {
    const tag = draft.trim().replace(/\s+/g, ' ');
    if (!tag) return;
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) await onChange([...tags, tag]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void add();
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-muted">Tags</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs text-ink">
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} className="rounded-full p-0.5 text-ink-muted hover:text-ink" onClick={() => void onChange(tags.filter((t) => t !== tag))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <Input aria-label="Add a tag" placeholder="Add tag" list="lead-tag-suggestions" maxLength={30} value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} className="h-7 w-32 px-2 text-xs" />
          <IconButton label="Add tag" className="size-7" onClick={() => void add()} disabled={!draft.trim()}><Plus className="size-3.5" /></IconButton>
        </span>
        <datalist id="lead-tag-suggestions">{suggestions.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
      </div>
    </div>
  );
}

function activityText(a: LeadActivity): string {
  if (a.type === 'status_change' && a.outcome) {
    const [from, to] = a.outcome.split('→') as [LeadStatus, LeadStatus];
    return `${STAGE_LABEL[from] ?? from} → ${STAGE_LABEL[to] ?? to}`;
  }
  return a.body ?? a.type.replace('_', ' ');
}

function Timeline({ lead }: { lead: Lead }) {
  // Reloads whenever the lead changes (a move updates last_updated)
  const { data, error } = useLoad(() => call('leads:activity', { id: lead.id }), lead.last_updated);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink-muted">Timeline</span>
      {error ? <p className="text-xs text-st-lost">{error}</p> : !data ? <Skeleton className="h-12" /> : data.length === 0 ? (
        <p className="text-xs text-ink-muted">No activity yet. Stage moves are recorded here from now on.</p>
      ) : (
        <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
          {data.map((a) => (
            <li key={a.id} className="relative text-sm">
              <span aria-hidden className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-gold" />
              <div className="text-ink">{activityText(a)}</div>
              {a.type === 'status_change' && a.body && <div className="text-xs text-ink-muted">{a.body}</div>}
              <div className="text-xs text-ink-muted tabular">{formatDateTime(a.created_at)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LeadDetail({ lead, actions, tagSuggestions }: { lead: Lead; actions: LeadActions; tagSuggestions: string[] }) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [notAFitOpen, setNotAFitOpen] = useState(false);
  const [addToBlocklist, setAddToBlocklist] = useState(false);
  const [busy, setBusy] = useState(false);
  const flagged = lead.is_chain === 1;

  const save = async () => {
    setSaving(true);
    try {
      await actions.saveNotes(lead, notes);
    } finally {
      setSaving(false);
    }
  };

  const confirmNotAFit = async () => {
    setBusy(true);
    try {
      await actions.markNotAFit(lead, addToBlocklist);
      setNotAFitOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <ScoreSeal score={lead.score} stamp />
        <StatusPill status={lead.status} />
        <div className="ml-auto flex items-center gap-1">
          <IconButton label={lead.starred ? 'Unstar' : 'Star'} active={lead.starred === 1} onClick={() => void actions.setStar(lead, lead.starred !== 1)}>
            <Star className={cn('size-4', lead.starred === 1 && 'fill-current text-gold')} />
          </IconButton>
          <IconButton label="Edit lead" onClick={() => actions.edit(lead)}><Pencil className="size-4" /></IconButton>
        </div>
      </div>

      {flagged && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elev px-3.5 py-3">
          <div className="text-sm">
            <div className="font-medium text-ink">{lead.chain_reason === 'not_a_fit' ? 'Marked not a fit' : 'Flagged as a chain'}</div>
            <div className="text-xs text-ink-muted">
              {lead.chain_reason === 'not_a_fit' ? 'Hidden from your leads and top opportunities.' : 'Its name matches the chain blocklist (Arcana → Data).'}
            </div>
          </div>
          <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => void actions.unflag(lead)}>Unflag</Button>
        </div>
      )}

      <div className="border-y border-border py-4">
        <StageStepper lead={lead} onMove={(to) => actions.move(lead, to)} />
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-ink-muted">Phone</dt>
          <dd className="mt-0.5">
            {lead.phone
              ? <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 font-medium text-gold-ink tabular hover:underline"><Phone className="size-3.5" />{lead.phone}</a>
              : <span className="text-ink-muted">Not available</span>}
          </dd>
        </div>
        {(lead.owner_name || lead.best_time) && (
          <>
            <Detail label="Owner or contact" value={lead.owner_name || '—'} />
            <Detail label="Best time" value={lead.best_time || '—'} />
          </>
        )}
        <div className="col-span-2">
          <dt className="text-xs text-ink-muted">Address</dt>
          <dd className="mt-0.5 text-ink">{lead.address || 'No address provided'}</dd>
        </div>
        <div className="col-span-2">
          <WebsitePanel lead={lead} onChanged={actions.refresh} />
        </div>
        <Detail label="Source" value={lead.source.toUpperCase()} />
        <Detail label="Enrichment" value={lead.enrichment_status} />
        <Detail label="Discovered" value={formatDateTime(lead.discovered_at) || 'N/A'} />
        <Detail label="Last contacted" value={formatDateTime(lead.last_contacted_at) || 'Not yet'} />
        {lead.rating != null && <Detail label="Google rating" value={`${lead.rating}★${lead.review_count ? ` · ${lead.review_count} reviews` : ''}`} />}
      </dl>

      {lead.enrichment_status === 'review' && <NameCheckPanel lead={lead} onChanged={actions.refresh} />}

      <TagEditor tags={lead.tags} suggestions={tagSuggestions} onChange={(tags) => actions.setTags(lead, tags)} />

      <div className="flex flex-col gap-2">
        <label htmlFor="lead-notes" className="text-xs font-medium text-ink-muted">Notes</label>
        <Textarea
          id="lead-notes"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Client conversations, pricing, follow-up details…"
        />
        <Button size="sm" variant="primary" className="self-end" icon={<Check className="size-3.5" />} loading={saving} onClick={() => void save()}>Save notes</Button>
      </div>

      <Timeline lead={lead} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {!flagged && (
          <Button variant="ghost" size="sm" icon={<Ban className="size-3.5" />} onClick={() => { setAddToBlocklist(false); setNotAFitOpen(true); }}>Mark not a fit</Button>
        )}
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => actions.remove(lead)}>Delete lead</Button>
      </div>

      <ConfirmDialog
        open={notAFitOpen}
        onOpenChange={setNotAFitOpen}
        title="Mark not a fit?"
        description="The lead is hidden from your leads and top opportunities. You can unflag it any time (Show chains)."
        confirmLabel="Mark not a fit"
        tone="primary"
        busy={busy}
        onConfirm={() => void confirmNotAFit()}
      >
        <Checkbox
          id="not-a-fit-blocklist"
          checked={addToBlocklist}
          onChange={setAddToBlocklist}
          label={<span>Also add <span className="font-semibold text-ink">“{lead.name}”</span> to the chain blocklist, flagging other leads with that name</span>}
        />
      </ConfirmDialog>
    </div>
  );
}

// The AI website check: Model A's verdict, its reason and evidence, and a button to (re)check.
// Without a website_url it costs one Otari web search; with one, Faber reads that page itself.
function WebsitePanel({ lead, onChanged }: { lead: Lead; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const checked = lead.website_checked_at !== null;

  const check = async () => {
    setBusy(true);
    try {
      const result = await call('ai:checkWebsite', { leadId: lead.id });
      if (result.error) {
        toast({ title: 'Website not checked', description: result.error, tone: 'error' });
      } else {
        toast({ title: VERDICT_LABEL[result.verdict], description: `${result.reason || lead.name} · ${usd(result.costUsd)}`, tone: 'success' });
      }
      await onChanged();
    } catch (err) {
      toast({ title: 'Website not checked', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-muted">Website</span>
        <WebsiteBadge lead={lead} />
        <Button size="sm" variant="ghost" className="ml-auto" icon={<Globe className="size-3.5" />} loading={busy}
          title={lead.website_url ? 'Faber reads the site itself; about $0.001' : 'One Otari web search plus small model calls; about $0.011'}
          onClick={() => void check()}>
          {checked ? 'Check again' : 'Check website'}
        </Button>
      </div>
      {lead.website_url && (
        <a href={lead.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-sm text-gold-ink hover:underline">
          <Globe className="size-3.5 shrink-0" />{lead.website_url}
        </a>
      )}
      {checked && (
        <p className="text-sm text-ink">
          {lead.website_reason || 'No reason given.'}
          {lead.website_evidence && lead.website_evidence !== lead.website_url && (
            <> <a href={lead.website_evidence} target="_blank" rel="noreferrer" className="break-all text-gold-ink hover:underline">Evidence</a></>
          )}
          <span className="block text-xs text-ink-muted tabular">Checked {formatDateTime(lead.website_checked_at)}</span>
        </p>
      )}
    </div>
  );
}

// Enrichment flagged this lead because its Google Maps name didn't match. Model A suggests; you decide.
function NameCheckPanel({ lead, onChanged }: { lead: Lead; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [suggestion, setSuggestion] = useState<NameMatchSuggestion | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'suggest' | 'match' | 'no_match' | null>(null);

  const suggest = async () => {
    setBusy('suggest');
    try {
      const next = await call('ai:suggestNameMatch', { leadId: lead.id });
      setSuggestion(next);
      setName(next.suggestedName ?? lead.name);
    } catch (err) {
      toast({ title: 'Name check failed', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (decision: 'match' | 'no_match') => {
    setBusy(decision);
    try {
      await call('leads:resolveReview', { id: lead.id, decision, ...(decision === 'match' ? { name } : {}) });
      toast({ title: decision === 'match' ? 'Confirmed: queued for enrichment again' : 'Marked as a different business', tone: 'success' });
      await onChanged();
    } catch (err) {
      toast({ title: 'Could not save the decision', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <div className="text-sm">
        <div className="font-medium text-ink">Name check needed</div>
        <div className="text-xs text-ink-muted">Google Maps showed a different name for this place. Is it the same business?</div>
      </div>
      {!suggestion ? (
        <Button size="sm" className="self-start" icon={<Sparkles className="size-3.5" />} loading={busy === 'suggest'}
          title="One Otari web search plus small model calls; about $0.011" onClick={() => void suggest()}>
          Suggest with AI
        </Button>
      ) : (
        <>
          <p className="text-sm text-ink">
            <span className="font-semibold">{suggestion.decision === 'match' ? 'Looks like a match' : suggestion.decision === 'no_match' ? 'Looks like a different business' : 'Not sure'}</span>
            {suggestion.reason && <> · {suggestion.reason}</>}
            {suggestion.evidenceUrl && <> <a href={suggestion.evidenceUrl} target="_blank" rel="noreferrer" className="text-gold-ink hover:underline">Evidence</a></>}
            <span className="block text-xs text-ink-muted tabular">AI suggestion, {usd(suggestion.costUsd)}. Nothing changes until you choose.</span>
          </p>
          <label htmlFor="name-check-name" className="text-xs text-ink-muted">Name to keep if it's a match</label>
          <Input id="name-check-name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} disabled={!name.trim()} loading={busy === 'match'} onClick={() => void resolve('match')}>Confirm match</Button>
            <Button size="sm" variant="ghost" loading={busy === 'no_match'} onClick={() => void resolve('no_match')}>Not the same business</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink tabular">{value}</dd>
    </div>
  );
}
