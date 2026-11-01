import { useEffect, useMemo, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { BookOpen, CalendarDays, CornerDownLeft, FolderKanban, History, Search, Zap } from 'lucide-react';
import { call } from '../lib/ipc.ts';
import { cn } from '../lib/format.ts';
import { readLocal, writeLocal } from '../lib/settings.ts';
import { KeyboardHint, RuneStrip } from '../ui/index.ts';
import type { SearchHit } from '../../shared/types.ts';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const RECENT_KEY = 'faber.palette.recent';
const RECENT_MAX = 6;
const HIT_ICON = { lead: BookOpen, project: FolderKanban, reminder: CalendarDays };

type Row =
  | { kind: 'action'; key: string; action: PaletteAction }
  | { kind: 'hit'; key: string; hit: SearchHit; recent?: boolean };

// Ctrl+K: search leads, projects and reminders (in main) and run app actions
export function CommandPalette({ open, onOpenChange, actions, onOpenHit, initialQuery = '' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: PaletteAction[];
  onOpenHit: (hit: SearchHit) => void;
  initialQuery?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <RadixDialog.Content className="fixed left-1/2 top-[13vh] z-50 w-[640px] max-w-[calc(100vw-2rem)] -translate-x-1/2 focus:outline-none">
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Search leads, projects and reminders, or run an action</RadixDialog.Description>
          {/* Ink spreads open from the centre, then the panel settles in */}
          <motion.div aria-hidden className="decor pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(closest-side, rgba(7,16,28,0.95), rgba(7,16,28,0))' }}
            initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 6, opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} />
          <motion.div
            className="gilt relative overflow-hidden rounded-[var(--radius-frame)] shadow-2xl"
            style={{ background: 'linear-gradient(180deg, #14213A, #0C1626)', color: '#F1E6D2' }}
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <RuneStrip className="mx-3 mt-1.5 !w-auto" opacity={0.4} />
            {open && <PaletteBody actions={actions} initialQuery={initialQuery} onClose={() => onOpenChange(false)} onOpenHit={onOpenHit} />}
            <RuneStrip className="mx-3 mb-1.5 !w-auto" opacity={0.4} />
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function PaletteBody({ actions, initialQuery, onClose, onOpenHit }: {
  actions: PaletteAction[]; initialQuery: string; onClose: () => void; onOpenHit: (hit: SearchHit) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [recent] = useState<SearchHit[]>(() => readLocal<SearchHit[]>(RECENT_KEY, []));
  const q = query.trim().toLowerCase();

  // Debounced search in main
  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      call('search:query', { q }).then((result) => { if (!cancelled) setHits(result); }).catch(() => {});
    }, 140);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q]);

  const rows: Row[] = useMemo(() => {
    const matchingActions = actions.filter((a) => !q || `${a.label} ${a.keywords ?? ''}`.toLowerCase().includes(q));
    const actionRows = matchingActions.map((action): Row => ({ kind: 'action', key: `a:${action.id}`, action }));
    if (!q) return [...recent.map((hit): Row => ({ kind: 'hit', key: `r:${hit.type}:${hit.id}`, hit, recent: true })), ...actionRows];
    return [...hits.map((hit): Row => ({ kind: 'hit', key: `h:${hit.type}:${hit.id}`, hit })), ...actionRows];
  }, [actions, hits, q, recent]);

  const execute = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === 'action') {
      row.action.run();
    } else {
      const next = [row.hit, ...recent.filter((r) => !(r.type === row.hit.type && r.id === row.hit.id))].slice(0, RECENT_MAX);
      writeLocal(RECENT_KEY, next);
      onOpenHit(row.hit);
    }
  };

  const selected = Math.min(active, Math.max(rows.length - 1, 0));

  return (
    <div onKeyDown={(e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(selected + 1, rows.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(selected - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); execute(rows[selected]); }
    }}>
      <div className="mx-3 my-2 flex items-center gap-3 rounded-md border px-4" style={{ borderColor: 'var(--gilt-a)', background: 'rgba(0,0,0,0.25)' }}>
        <Search className="size-4 text-[#F0C27A]" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); if (!e.target.value.trim()) setHits([]); }}
          placeholder="Search leads, projects, reminders — or type a command"
          aria-label="Search or run a command"
          className="h-12 flex-1 bg-transparent text-base text-[#F1E6D2] placeholder:text-[#A9A08F] focus:outline-none focus-visible:outline-none"
        />
        <KeyboardHint keys={['Esc']} />
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
        {rows.length === 0 && <div className="px-3 py-6 text-center text-sm text-[#A9A08F]">Nothing matches “{query}”.</div>}
        {rows.map((row, i) => {
          const isActive = i === selected;
          const showHeading = i === 0 || rows[i - 1].kind !== row.kind || (row.kind === 'hit' && rows[i - 1].kind === 'hit' && Boolean(row.recent) !== Boolean((rows[i - 1] as { recent?: boolean }).recent));
          const heading = row.kind === 'action' ? 'Actions' : row.recent ? 'Recent' : 'Results';
          return (
            <div key={row.key}>
              {showHeading && <div className="px-3 pb-1 pt-2 font-display text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#F0C27A]">{heading}</div>}
              <motion.div
                role="option"
                aria-selected={isActive}
                onMouseMove={() => setActive(i)}
                onClick={() => execute(row)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, delay: Math.min(i, 8) * 0.02 }}
                className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', isActive ? 'parchment shadow-md' : 'text-[#F1E6D2]')}
              >
                {row.kind === 'action' ? (
                  <>
                    <Keycap><Zap className="size-3.5" /></Keycap>
                    <span className="flex-1 text-sm">{row.action.label}</span>
                    {row.action.hint && <span className="rounded border px-1.5 py-0.5 text-[0.7rem] opacity-80" style={{ borderColor: 'currentColor' }}>{row.action.hint}</span>}
                  </>
                ) : (
                  <HitRow hit={row.hit} recent={row.recent} />
                )}
                {isActive && <CornerDownLeft className="size-3.5 opacity-70" aria-hidden />}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Gold keycap tile (G12)
function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[#2A1E12]"
      style={{ background: 'linear-gradient(180deg, #F3D79A, #C9A24A)', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.4)' }}>
      {children}
    </span>
  );
}

function HitRow({ hit, recent }: { hit: SearchHit; recent?: boolean }) {
  const Icon = recent ? History : HIT_ICON[hit.type];
  return (
    <>
      <Keycap><Icon className="size-3.5" /></Keycap>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{hit.title}</span>
        <span className="block truncate text-xs opacity-75">{hit.subtitle}</span>
      </span>
    </>
  );
}
