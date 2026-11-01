import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { cn } from '../../lib/format.ts';
import { Button, EmptyState, ScoreSeal } from '../../ui/index.ts';
import { canMove, LEAD_STATUSES, STAGE_LABEL, STAGES, type LeadStatus } from '../../../shared/pipeline.ts';
import type { Lead } from '../../../shared/types.ts';
import { ChainPill } from './LeadDrawer.tsx';

// Big columns (hundreds of new leads) render in pages so the board stays light
const PAGE = 60;

const nextStage = (s: LeadStatus): LeadStatus | null => (s === 'lost' || s === 'won' ? null : STAGES[STAGES.indexOf(s) + 1] ?? null);
const prevStage = (s: LeadStatus): LeadStatus | null => (s === 'lost' || s === 'won' || s === 'new' ? null : STAGES[STAGES.indexOf(s) - 1]);

// Codex board (§8.1): one column per shown stage. Native drag-and-drop between columns, with
// arrow buttons and ←/→ on a focused card as the fallback. Only allowed moves accept a drop.
export function LeadBoard({ leads, stages, selectedId, onOpen, onMove }: {
  leads: Lead[];
  stages: LeadStatus[];
  selectedId: number | null;
  onOpen: (lead: Lead) => void;
  onMove: (lead: Lead, to: LeadStatus) => void;
}) {
  const [dragging, setDragging] = useState<Lead | null>(null);
  // The ref is set synchronously on dragstart: dragover can fire before React re-renders
  const dragRef = useRef<Lead | null>(null);
  const startDrag = (lead: Lead | null) => {
    dragRef.current = lead;
    setDragging(lead);
  };
  const [over, setOver] = useState<LeadStatus | null>(null);
  const [shown, setShown] = useState<Partial<Record<LeadStatus, number>>>({});
  const columns = LEAD_STATUSES.filter((s) => stages.includes(s));

  const drop = (e: DragEvent, stage: LeadStatus) => {
    e.preventDefault();
    setOver(null);
    const lead = dragRef.current;
    if (lead && canMove(lead.status, stage)) onMove(lead, stage);
    startDrag(null);
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-5" aria-label="Pipeline board">
      {columns.map((stage) => {
        const items = leads.filter((l) => l.status === stage);
        const limit = shown[stage] ?? PAGE;
        const accepts = dragging !== null && canMove(dragging.status, stage);
        return (
          <section
            key={stage}
            aria-label={`${STAGE_LABEL[stage]} leads`}
            onDragOver={(e) => {
              const lead = dragRef.current;
              if (lead && canMove(lead.status, stage)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(stage); }
            }}
            onDragLeave={() => setOver((o) => (o === stage ? null : o))}
            onDrop={(e) => drop(e, stage)}
            className={cn('glass flex w-[272px] shrink-0 flex-col overflow-hidden rounded-[var(--radius-md)] transition-shadow',
              dragging && !accepts && 'opacity-60',
              over === stage && 'shadow-[var(--glow-gold)]')}
          >
            <header className="plank relative flex items-center justify-between px-4 py-3">
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ backgroundColor: `var(--hue-${stage})` }} />
              <h2 className="font-display text-sm font-semibold tracking-[0.12em]">{STAGE_LABEL[stage]}</h2>
              <span className="rounded-full bg-[rgba(0,0,0,0.35)] px-2.5 py-0.5 text-xs font-semibold tabular text-[#F0C27A]">{items.length}</span>
            </header>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
              {items.length === 0 ? (
                <EmptyState title={dragging && accepts ? 'Drop here' : `No ${STAGE_LABEL[stage].toLowerCase()} leads`} className="py-6" />
              ) : (
                items.slice(0, limit).map((lead) => (
                  <BoardCard
                    key={lead.id}
                    lead={lead}
                    selected={lead.id === selectedId}
                    dragging={dragging?.id === lead.id}
                    onOpen={() => onOpen(lead)}
                    onMove={(to) => onMove(lead, to)}
                    onDragStart={() => startDrag(lead)}
                    onDragEnd={() => { startDrag(null); setOver(null); }}
                  />
                ))
              )}
              {items.length > limit && (
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setShown((s) => ({ ...s, [stage]: limit + PAGE }))}>
                  Show {Math.min(PAGE, items.length - limit)} more
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({ lead, selected, dragging, onOpen, onMove, onDragStart, onDragEnd }: {
  lead: Lead; selected: boolean; dragging: boolean; onOpen: () => void; onMove: (to: LeadStatus) => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const back = prevStage(lead.status);
  const forward = nextStage(lead.status);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') onOpen();
    else if (e.key === 'ArrowRight' && forward) { e.preventDefault(); onMove(forward); }
    else if (e.key === 'ArrowLeft' && back) { e.preventDefault(); onMove(back); }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${lead.name}, ${STAGE_LABEL[lead.status]}. Arrow keys move it between stages.`}
      draggable={lead.status !== 'won'}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(lead.id)); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={onKey}
      className={cn('parchment on-parchment sheen lift relative flex cursor-pointer flex-col gap-2 rounded-md p-3 transition-[transform,opacity] duration-150',
        selected && 'shadow-[var(--glow-gold)]', dragging && 'rotate-2 scale-[1.02] opacity-60', lead.is_chain === 1 && 'opacity-75')}
    >
      <div className="flex items-start gap-2.5">
        <ScoreSeal score={lead.score} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium text-ink">{lead.name}</span>
            {lead.starred === 1 && <Star aria-label="Starred" className="size-3.5 shrink-0 fill-current text-gold-ink" />}
          </div>
          <div className="truncate text-xs text-ink-muted">{lead.category || 'Uncategorized'}{lead.city ? ` · ${lead.city}` : ''}</div>
        </div>
      </div>
      {(lead.tags.length > 0 || lead.is_chain === 1) && (
        <div className="flex flex-wrap gap-1">
          {lead.is_chain === 1 && <ChainPill lead={lead} />}
          {lead.tags.slice(0, 3).map((t) => <span key={t} className="rounded-full border border-[rgba(120,80,30,0.3)] px-2 py-0.5 text-[0.68rem] text-ink-muted">{t}</span>)}
        </div>
      )}
      {(back || forward) && (
        <div className="flex justify-end gap-1.5 border-t border-[rgba(120,80,30,0.25)] pt-2" onClick={(e) => e.stopPropagation()}>
          {back && (
            <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={() => onMove(back)} aria-label={`Move back to ${STAGE_LABEL[back]}`}>
              {STAGE_LABEL[back]}
            </Button>
          )}
          {forward && (
            <Button size="sm" variant="secondary" onClick={() => onMove(forward)} aria-label={`Move to ${STAGE_LABEL[forward]}`}>
              {STAGE_LABEL[forward]}<ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
