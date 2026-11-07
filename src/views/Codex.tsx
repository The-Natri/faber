import { useCallback, useMemo, useState } from 'react';
import { KanbanSquare, List, Phone, Plus, Star } from 'lucide-react';
import { call, errorText } from '../lib/ipc.ts';
import { cn } from '../lib/format.ts';
import { useLoad } from '../lib/useLoad.ts';
import { playSound } from '../lib/sound.ts';
import { useNavigation, useViewRequest, type ViewProps } from '../lib/navigation.ts';
import { Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, IconButton, ScoreSeal, Skeleton, StatusPill, useToast } from '../ui/index.ts';
import { STAGE_LABEL, type LeadStatus, type LostReason } from '../../shared/pipeline.ts';
import { DEFAULT_LEAD_FILTERS, type BulkLeadAction, type Lead, type LeadFilters as Filters } from '../../shared/types.ts';
import { EnrichmentBar } from './codex/EnrichmentBar.tsx';
import { WebsiteCheckBar } from './codex/WebsiteCheckBar.tsx';
import { WebsiteBadge } from './codex/WebsiteBadge.tsx';
import { LeadMap } from './codex/LeadMap.tsx';
import { ChainPill, LeadDrawer, type LeadActions } from './codex/LeadDrawer.tsx';
import { LeadFilters, stagesOf } from './codex/LeadFilters.tsx';
import { LeadBoard } from './codex/LeadBoard.tsx';
import { BulkBar } from './codex/BulkBar.tsx';
import { LeadFormDialog } from './codex/LeadForm.tsx';
import { LostDialog } from './codex/LostDialog.tsx';

type ViewMode = 'list' | 'board';
const VIEW_KEY = 'faber.codex.view';

function savedView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Codex · Leads — list (with map) or pipeline board, filters and sorting in SQL, bulk actions,
// manual add/edit and the lead drawer.
export default function Codex({ request }: ViewProps) {
  const toast = useToast();
  const { navigate } = useNavigation();
  const [filters, setFilters] = useState<Filters>(DEFAULT_LEAD_FILTERS);
  const filterKey = JSON.stringify(filters);
  const { data, error, loading, reload } = useLoad(() => call('leads:list', filters), filterKey);
  const leads = useMemo(() => data ?? [], [data]);
  const facets = useLoad(() => call('leads:facets'));
  const [view, setView] = useState<ViewMode>(savedView);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  // A lead opened from search can sit outside the current filters, so the drawer loads it directly
  const detail = useLoad(() => (selectedId == null ? Promise.resolve(null) : call('leads:get', { id: selectedId })), selectedId);
  const [lostFor, setLostFor] = useState<Lead[] | null>(null);
  const [wonFor, setWonFor] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);

  useViewRequest(request, ({ focus, intent }) => {
    if (focus?.type === 'lead') setSelectedId(focus.id);
    if (intent === 'new') setForm({ open: true, lead: null });
  });

  const selected = leads.find((l) => l.id === selectedId) ?? (detail.data?.id === selectedId ? detail.data : null);
  const visibleChecked = leads.filter((l) => checked.has(l.id)).map((l) => l.id);

  const switchView = (next: ViewMode) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* per-viewer convenience only */ }
  };

  const refresh = useCallback(async () => {
    await Promise.all([reload(), facets.reload(), detail.reload()]);
  }, [reload, facets, detail]);

  const fail = useCallback((title: string, err: unknown) => toast({ title, description: errorText(err), tone: 'error' }), [toast]);

  const run = useCallback(async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
      await refresh();
      return true;
    } catch (err) {
      fail(failure, err);
      return false;
    }
  }, [refresh, fail]);

  // ── Moves: lost asks why, won confirms (it creates a project) ───────────
  const move = (lead: Lead, to: LeadStatus) => {
    if (to === 'lost') setLostFor([lead]);
    else if (to === 'won') setWonFor(lead);
    else void doMove(lead, to);
  };

  const doMove = async (lead: Lead, to: LeadStatus, lostReason?: LostReason, note?: string) => {
    try {
      const { project_id } = await call('leads:move', { id: lead.id, to, lostReason, note: note || undefined });
      await refresh();
      if (to === 'contacted') playSound('letterSent');
      if (project_id) {
        toast({
          title: 'Won! Now a project in Forge',
          description: lead.name,
          tone: 'success',
          action: { label: 'Open in Forge', onClick: () => navigate({ view: 'forge', focus: { type: 'project', id: project_id } }) },
        });
      } else {
        toast({ title: `Moved to ${STAGE_LABEL[to]}`, description: lead.name });
      }
      return true;
    } catch (err) {
      fail('Could not move the lead', err);
      return false;
    }
  };

  const confirmWon = async () => {
    if (!wonFor) return;
    setBusy(true);
    if (await doMove(wonFor, 'won')) setWonFor(null);
    setBusy(false);
  };

  const confirmLost = async (reason: LostReason, note: string) => {
    if (!lostFor) return;
    if (lostFor.length === 1 && !checked.size) {
      if (await doMove(lostFor[0], 'lost', reason, note)) setLostFor(null);
      return;
    }
    await bulk({ type: 'move', to: 'lost', lostReason: reason, note: note || undefined }, 'Marked lost');
    setLostFor(null);
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const bulk = async (action: BulkLeadAction, label: string) => {
    const ids = visibleChecked;
    try {
      const { done, skipped } = await call('leads:bulk', { ids, action });
      if (action.type === 'delete') setChecked(new Set());
      await refresh();
      toast({
        title: `${label}: ${plural(done, 'lead')}`,
        description: skipped.length
          ? `${plural(skipped.length, 'lead')} skipped: ${skipped.slice(0, 3).map((s) => `${s.name} (${s.reason})`).join(', ')}${skipped.length > 3 ? '…' : ''}`
          : undefined,
        tone: skipped.length ? undefined : 'success',
        action: action.type === 'delete'
          ? { label: 'Undo', onClick: () => void run(() => call('leads:bulk', { ids, action: { type: 'restore' } }), 'Could not restore the leads') }
          : undefined,
      });
    } catch (err) {
      fail('Bulk action failed', err);
    }
  };

  const exportSelected = async () => {
    try {
      const { path, rows } = await call('export:csv', { entity: 'leads', ids: visibleChecked });
      if (path) toast({ title: `Exported ${plural(rows, 'lead')}`, description: path, tone: 'success' });
    } catch (err) {
      fail('Export failed', err);
    }
  };

  const toggleChecked = (id: number) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChecked = leads.length > 0 && visibleChecked.length === leads.length;

  // ── Single-lead actions for the drawer ─────────────────────────────────
  const actions: LeadActions = {
    move,
    saveNotes: async (lead, notes) => {
      if (await run(() => call('leads:updateNotes', { id: lead.id, notes }), 'Failed to save notes')) {
        toast({ title: 'Notes saved', tone: 'success' });
      }
    },
    edit: (lead) => setForm({ open: true, lead }),
    refresh,
    setStar: async (lead, starred) => { await run(() => call('leads:setStar', { id: lead.id, starred }), 'Could not update the star'); },
    setTags: async (lead, tags) => { await run(() => call('leads:setTags', { id: lead.id, tags }), 'Could not save the tags'); },
    markNotAFit: async (lead, addToBlocklist) => {
      try {
        const { alsoFlagged } = await call('leads:markNotAFit', { id: lead.id, addToBlocklist });
        if (!filters.showChains) setSelectedId(null);
        await refresh();
        toast({
          title: 'Marked not a fit',
          description: alsoFlagged > 0
            ? `${lead.name} was added to the blocklist; ${plural(alsoFlagged, 'other lead')} with that name flagged too.`
            : addToBlocklist ? `${lead.name} was added to the blocklist.` : lead.name,
          action: { label: 'Undo', onClick: () => void run(() => call('leads:unflagChain', { id: lead.id }), 'Could not unflag the lead') },
        });
      } catch (err) {
        fail('Failed to mark not a fit', err);
      }
    },
    unflag: async (lead) => {
      if (await run(() => call('leads:unflagChain', { id: lead.id }), 'Could not unflag the lead')) {
        toast({ title: 'Unflagged', description: `${lead.name} is back in your leads.`, tone: 'success' });
      }
    },
    remove: async (lead) => {
      try {
        await call('leads:delete', { id: lead.id });
        setSelectedId(null);
        await refresh();
        toast({
          title: 'Lead moved to the trash',
          description: lead.name,
          action: { label: 'Undo', onClick: () => void run(() => call('trash:restore', { type: 'lead', id: lead.id }), 'Could not restore the lead') },
        });
      } catch (err) {
        fail('Failed to delete lead', err);
      }
    },
  };

  // Chains are never enriched, so they don't count as pending
  const pending = leads.filter((l) => l.is_chain === 0 && (l.enrichment_status || 'pending') === 'pending').length;

  const list = error ? (
    <ErrorState message={error} onRetry={reload} />
  ) : loading && !data ? (
    <div className="space-y-2.5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[78px]" />)}</div>
  ) : leads.length === 0 ? (
    <EmptyState title="No leads match these filters" line="Try other stages or filters, or add a lead by hand." />
  ) : (
    <ul className="space-y-2.5">
      {leads.map((lead) => (
        <li key={lead.id}>
          <LeadRow lead={lead} selected={lead.id === selectedId} checked={checked.has(lead.id)}
            onSelect={() => setSelectedId(lead.id)} onCheck={() => toggleChecked(lead.id)}
            onStar={() => void actions.setStar(lead, lead.starred !== 1)} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full">
      <aside className={cn('flex h-full flex-col border-r border-border bg-surface', view === 'list' ? 'w-[40%] min-w-[420px]' : 'w-[340px] shrink-0')}>
        <EnrichmentBar pending={pending} onFinished={() => void refresh()} />
        <WebsiteCheckBar onFinished={() => void refresh()} />

        {/* Filters, bulk bar and list scroll together so open filters never squeeze the list */}
        <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2.5">
              <h1 className="font-display text-xl font-semibold tracking-wide text-gold-ink">Codex</h1>
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">Leads</span>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="List and map" active={view === 'list'} onClick={() => switchView('list')}><List className="size-4" /></IconButton>
              <IconButton label="Pipeline board" active={view === 'board'} onClick={() => switchView('board')}><KanbanSquare className="size-4" /></IconButton>
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setForm({ open: true, lead: null })}>New lead</Button>
            </div>
          </div>
          <LeadFilters filters={filters} onChange={setFilters} facets={facets.data} />
          <div className="flex items-center justify-between text-xs text-ink-muted">
            {view === 'list' && leads.length > 0 ? (
              <Checkbox id="check-all" checked={allChecked} label="Select all shown"
                onChange={(on) => setChecked(on ? new Set(leads.map((l) => l.id)) : new Set())} />
            ) : <span />}
            <span className="tabular">Showing {leads.length}</span>
          </div>
        </div>

        {view === 'list' && visibleChecked.length > 0 && (
          <div className="sticky top-0 z-10"><BulkBar count={visibleChecked.length} onAction={bulk} onExport={exportSelected}
            onMoveLost={() => setLostFor(leads.filter((l) => checked.has(l.id)))} onClear={() => setChecked(new Set())} /></div>
        )}

        {view === 'list' && <div className="px-4 py-3">{list}</div>}
        {view === 'board' && (
          <p className="px-5 py-4 text-xs leading-relaxed text-ink-muted">
            Drag a card to another stage, or focus it and use ← →. Forward any number of steps, back one; lost asks why, won creates a project.
          </p>
        )}
        </div>
      </aside>

      <section className="relative h-full min-w-0 flex-1" aria-label={view === 'list' ? 'Map of leads' : 'Pipeline board'}>
        {view === 'list' ? (
          <LeadMap leads={leads} selected={selected} onSelect={(lead) => setSelectedId(lead.id)} />
        ) : error ? <ErrorState message={error} onRetry={reload} /> : (
          <LeadBoard leads={leads} stages={stagesOf(filters)} selectedId={selectedId} onOpen={(lead) => setSelectedId(lead.id)} onMove={move} />
        )}
      </section>

      <LeadDrawer lead={selected} onClose={() => setSelectedId(null)} actions={actions} tagSuggestions={facets.data?.tags ?? []} />

      <LeadFormDialog
        open={form.open}
        lead={form.lead}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        onSaved={(lead, flaggedAsChain) => {
          setForm({ open: false, lead: null });
          void refresh();
          setSelectedId(lead.id);
          toast({
            title: form.lead ? 'Lead saved' : 'Lead added',
            description: flaggedAsChain ? `${lead.name} matches the chain blocklist, so it's flagged (Unflag in the drawer if that's wrong).` : lead.name,
            tone: 'success',
          });
        }}
      />

      <LostDialog
        open={lostFor !== null}
        onOpenChange={(open) => !open && setLostFor(null)}
        subject={lostFor && lostFor.length === 1 && !checked.size ? lostFor[0].name : plural(lostFor?.length ?? 0, 'lead')}
        onConfirm={confirmLost}
      />

      <ConfirmDialog
        open={wonFor !== null}
        onOpenChange={(open) => !open && setWonFor(null)}
        title="Mark won?"
        description={`${wonFor?.name ?? ''} becomes a project in Forge. The lead stays in Codex as won, linked to it.`}
        confirmLabel="Mark won"
        tone="primary"
        busy={busy}
        onConfirm={() => void confirmWon()}
      />
    </div>
  );
}

function LeadRow({ lead, selected, checked, onSelect, onCheck, onStar }: {
  lead: Lead; selected: boolean; checked: boolean; onSelect: () => void; onCheck: () => void; onStar: () => void;
}) {
  return (
    <Card
      interactive
      selected={selected}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={lead.name}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); } }}
      className={cn('flex items-center gap-3 px-3.5 py-3', lead.is_chain === 1 && 'opacity-70')}
    >
      <span onClick={(e) => e.stopPropagation()} className="flex">
        <Checkbox checked={checked} onChange={onCheck} label={<span className="sr-only">Select {lead.name}</span>} />
      </span>
      <ScoreSeal score={lead.score} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm font-medium ${selected ? 'text-gold-ink' : 'text-ink'}`}>{lead.name}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {lead.is_chain === 1 && <ChainPill lead={lead} />}
            <WebsiteBadge lead={lead} />
            <StatusPill status={lead.status}>{STAGE_LABEL[lead.status]}</StatusPill>
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="truncate">
            {lead.category || 'Uncategorized'}{lead.city ? ` · ${lead.city}` : ''}
            {lead.tags.length > 0 && <span className="text-ink"> · {lead.tags.join(', ')}</span>}
          </span>
          {lead.phone && <span className="sensitive inline-flex shrink-0 items-center gap-1 tabular"><Phone className="size-3" />{lead.phone}</span>}
        </div>
      </div>
      <button
        type="button"
        aria-label={lead.starred === 1 ? `Unstar ${lead.name}` : `Star ${lead.name}`}
        aria-pressed={lead.starred === 1}
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className="shrink-0 rounded p-1 text-ink-muted hover:text-gold-ink"
      >
        <Star className={cn('size-4', lead.starred === 1 && 'fill-current text-gold-ink')} />
      </button>
    </Card>
  );
}

