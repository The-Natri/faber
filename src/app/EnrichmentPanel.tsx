import { useEffect, useState } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleDashed, Loader2, Sparkles, Square } from 'lucide-react';
import { call, errorText, subscribe } from '../lib/ipc.ts';
import { cn, formatDateTime } from '../lib/format.ts';
import { useNavigation } from '../lib/navigation.ts';
import { Button, StatusPill, WritingQuill, useToast } from '../ui/index.ts';
import type { EnrichmentState, EnrichmentStep } from '../../shared/types.ts';

// The steps v1 enrichment really performs for each lead
const STEPS: { id: EnrichmentStep; title: string; detail: string }[] = [
  { id: 'search', title: 'Find on Google Maps', detail: 'Searching for the business by name and city' },
  { id: 'rating', title: 'Rating & reviews', detail: 'Reading the star rating and review count' },
  { id: 'social', title: 'Social links', detail: 'Looking for Instagram and Facebook' },
  { id: 'match', title: 'Name check & score', detail: 'Confirming it is the same business, then scoring' },
];

function minutesAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return formatDateTime(iso);
}

export function useEnrichmentState(): EnrichmentState | null {
  const [state, setState] = useState<EnrichmentState | null>(null);
  useEffect(() => {
    let cancelled = false;
    call('enrichment:getState').then((s) => { if (!cancelled) setState(s); }).catch(() => {});
    const off = subscribe('enrichment:state', setState);
    return () => { cancelled = true; off(); };
  }, []);
  return state;
}

// Header chip: a quill writes while enrichment runs and lifts on a CAPTCHA. Opens the panel.
export function EnrichmentChip() {
  const state = useEnrichmentState();
  const [open, setOpen] = useState(false);
  if (!state || (!state.running && state.recent.length === 0)) return null;
  const paused = state.captchaPending;

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium tabular cursor-pointer',
            paused ? 'text-st-contacted' : state.running ? 'text-gold-ink' : 'text-ink-muted'
          )}
          style={{ borderColor: paused ? 'var(--hue-contacted)' : state.running ? 'var(--gold)' : 'var(--border)' }}
          aria-label="Background enrichment"
        >
          <WritingQuill writing={state.running} raised={paused} />
          {paused ? 'Paused — CAPTCHA' : state.running ? `Enriching ${state.processed}/${state.total}` : 'Enrichment'}
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content align="end" sideOffset={8} className="z-[60] focus:outline-none">
          <EnrichmentPanel state={state} onNavigate={() => setOpen(false)} />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

function EnrichmentPanel({ state, onNavigate }: { state: EnrichmentState; onNavigate: () => void }) {
  const toast = useToast();
  const { navigate } = useNavigation();
  const stepIndex = state.step ? STEPS.findIndex((s) => s.id === state.step) : -1;
  const status = state.captchaPending ? 'Paused for CAPTCHA' : state.running ? 'Running' : 'Idle';

  const act = (channel: 'enrichment:stop' | 'enrichment:retry' | 'enrichment:skip' | 'enrichment:run') =>
    void call(channel).catch((err) => toast({ title: 'Enrichment', description: errorText(err), tone: 'error' }));

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="glass gilt w-[420px] rounded-[var(--radius-lg)] p-5"
    >
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-gold-ink"><Sparkles className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-ink">Background enrichment</h2>
          <p className="font-serif text-sm italic text-ink-muted">Faber fills in the details while you work.</p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
          state.captchaPending ? 'text-st-contacted' : state.running ? 'text-success' : 'text-ink-muted')}
          style={{ background: state.running ? 'color-mix(in oklab, var(--success-fill) 35%, transparent)' : 'var(--surface-2)' }}>
          <span className="size-1.5 rounded-full bg-current" /> {status}
        </span>
      </header>

      {state.running && (
        <section className="mt-4 rounded-md border border-border bg-bg-elev">
          <div className="border-b border-border px-3 py-2 text-xs text-ink-muted">
            Now: <span className="font-medium text-ink">{state.current?.name ?? 'starting…'}</span>
            <span className="float-right tabular">{state.processed}/{state.total}</span>
          </div>
          <ul>
            {STEPS.map((step, i) => {
              const done = stepIndex > i;
              const active = stepIndex === i;
              return (
                <li key={step.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                  <span className={cn('flex size-6 items-center justify-center', done ? 'text-success' : active ? 'text-gold-ink' : 'text-ink-muted')}>
                    {done ? <Check className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : <CircleDashed className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm', active || done ? 'text-ink' : 'text-ink-muted')}>{step.title}</span>
                    <span className="block text-xs text-ink-muted">{step.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {state.captchaPending && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => act('enrichment:retry')}>Wait &amp; retry (15s)</Button>
          <Button size="sm" variant="ghost" className="flex-1" onClick={() => act('enrichment:skip')}>Skip this lead</Button>
        </div>
      )}

      <section className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Recent enrichments</h3>
        {state.recent.length === 0 ? (
          <p className="text-sm text-ink-muted">Results appear here as each lead finishes.</p>
        ) : (
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {state.recent.map((r) => (
                <motion.li key={`${r.lead_id}-${r.at}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <button
                    type="button"
                    onClick={() => { onNavigate(); navigate({ view: 'codex', focus: { type: 'lead', id: r.lead_id } }); }}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 cursor-pointer"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
                    <StatusPill status={r.outcome} />
                    <span className="w-20 shrink-0 text-right text-xs text-ink-muted tabular">{minutesAgo(r.at)}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <footer className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        {state.running
          ? <Button size="sm" variant="danger" icon={<Square className="size-3" />} onClick={() => act('enrichment:stop')}>Stop</Button>
          : <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} onClick={() => act('enrichment:run')}>Enrich next 20</Button>}
      </footer>
    </motion.div>
  );
}
