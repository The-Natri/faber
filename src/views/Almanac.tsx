import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { call, errorText } from '../lib/ipc.ts';
import { useLoad } from '../lib/useLoad.ts';
import { cn, formatDate, todayString } from '../lib/format.ts';
import { useViewRequest, type ViewProps } from '../lib/navigation.ts';
import { useDecor } from '../lib/motion.ts';
import {
  Badge, Button, Combobox, CountUp, DateInput, Dialog, EmptyState, ErrorState, Field, Input, Quill, Select, Skeleton, Smoke, StatusPill,
  ViewHeader, ViewScroll, useToast,
} from '../ui/index.ts';
import type { EntityOption, EntityType, Reminder } from '../../shared/types.ts';

const GROUP_STYLE = {
  overdue: { title: 'Overdue', tone: 'var(--st-lost)' },
  today: { title: 'Due today', tone: 'var(--st-contacted)' },
  upcoming: { title: 'Upcoming', tone: 'var(--st-new)' },
  completed: { title: 'Completed', tone: 'var(--ink-muted)' },
} as const;
type Group = keyof typeof GROUP_STYLE;

// Almanac · Reminders — v1 groups (overdue, today, upcoming, collapsible completed)
export default function Almanac({ request }: ViewProps) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => call('reminders:list'));
  const reminders = useMemo(() => data ?? [], [data]);
  const [adding, setAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);

  useViewRequest(request, ({ focus, intent }) => {
    if (intent === 'new') setAdding(true);
    if (focus?.type === 'reminder') setHighlight(focus.id);
  });

  // Bring a focused reminder into view once it is rendered
  useEffect(() => {
    if (highlight == null || !data) return;
    document.getElementById(`reminder-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, data]);

  const today = todayString();
  const groups: Record<Group, Reminder[]> = {
    overdue: reminders.filter((r) => !r.is_done && r.due_date < today),
    today: reminders.filter((r) => !r.is_done && r.due_date === today),
    upcoming: reminders.filter((r) => !r.is_done && r.due_date > today),
    completed: reminders.filter((r) => r.is_done === 1),
  };
  const open = reminders.filter((r) => !r.is_done).length;
  // A focused reminder that is already done opens the Completed group
  const completedOpen = showCompleted || groups.completed.some((r) => r.id === highlight);

  const fail = (title: string, err: unknown) => toast({ title, description: errorText(err), tone: 'error' });

  const markDone = async (r: Reminder) => {
    try {
      await call('reminders:markDone', { id: r.id });
      await reload();
      toast({ title: 'Reminder marked as completed', tone: 'success' });
    } catch (err) {
      fail('Failed to mark done', err);
    }
  };

  const remove = async (r: Reminder) => {
    try {
      await call('reminders:delete', { id: r.id });
      await reload();
      toast({
        title: 'Reminder moved to the trash',
        description: r.message,
        action: { label: 'Undo', onClick: () => void call('trash:restore', { type: 'reminder', id: r.id }).then(reload).catch((err) => fail('Could not restore', err)) },
      });
    } catch (err) {
      fail('Failed to delete reminder', err);
    }
  };

  return (
    <ViewScroll>
      <ViewHeader
        themed="Almanac"
        plain="Reminders"
        line="Follow-ups, renewals and the dates that must not slip."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add reminder</Button>}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <div className="mt-7 grid grid-cols-[200px_minmax(0,1fr)] gap-6">
          {/* Count rail: each count jumps to its group */}
          <nav aria-label="Reminder groups" className="glass sticky top-0 self-start rounded-[var(--radius-md)] p-2">
            <div className="px-3 pb-2 pt-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Open <span className="float-right tabular text-gold-ink"><CountUp value={open} /></span>
            </div>
            {(['overdue', 'today', 'upcoming', 'completed'] as const).map((g) => (
              <button key={g} type="button"
                onClick={() => { if (g === 'completed') setShowCompleted(true); document.getElementById(`group-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-ink hover:bg-surface-2 cursor-pointer">
                <span>{GROUP_STYLE[g].title}</span>
                <span className="font-semibold tabular" style={{ color: groups[g].length ? GROUP_STYLE[g].tone : 'var(--ink-muted)' }}><CountUp value={groups[g].length} /></span>
              </button>
            ))}
          </nav>
          <div className="min-w-0">

          {loading && !data ? (
            <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : reminders.length === 0 ? (
            <EmptyState
              title="The almanac is empty"
              line="Add a reminder to follow up with a lead or a client."
              sigil={<Quill size={52} />}
              action={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add reminder</Button>}
            />
          ) : (
            <div className="space-y-7">
              {(['overdue', 'today', 'upcoming'] as const).map((g) => (
                <ReminderGroup key={g} group={g} items={groups[g]} highlight={highlight} onDone={markDone} onDelete={remove} />
              ))}
              <div id="group-completed">
                <button
                  type="button"
                  onClick={() => { setShowCompleted(!completedOpen); setHighlight(null); }}
                  aria-expanded={completedOpen}
                  className="flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-ink cursor-pointer"
                >
                  {completedOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  {completedOpen ? 'Hide completed' : 'Show completed'}
                  <Badge className="tabular">{groups.completed.length}</Badge>
                </button>
                {completedOpen && (
                  <div className="mt-3">
                    <ReminderGroup group="completed" items={groups.completed} highlight={highlight} onDone={markDone} onDelete={remove} hideTitle />
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
          </div>
        </>
      )}

      <AddReminderDialog open={adding} onOpenChange={setAdding} onCreated={async () => { await reload(); toast({ title: 'Reminder created', tone: 'success' }); }} />
    </ViewScroll>
  );
}

function ReminderGroup({ group, items, highlight, onDone, onDelete, hideTitle }: {
  group: Group; items: Reminder[]; highlight: number | null; onDone: (r: Reminder) => Promise<void>; onDelete: (r: Reminder) => void; hideTitle?: boolean;
}) {
  const style = GROUP_STYLE[group];
  const decor = useDecor();
  // Marking an overdue reminder done clears its smoke and glow before it moves to Completed
  const [clearing, setClearing] = useState<number | null>(null);
  const finish = async (r: Reminder) => {
    if (decor && group === 'overdue') {
      setClearing(r.id);
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    await onDone(r);
    setClearing(null);
  };
  return (
    <section aria-label={style.title} id={`group-${group}`} className="scroll-mt-4">
      {!hideTitle && (
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold tracking-wide" style={{ color: style.tone }}>
          {style.title} <Badge className="tabular">{items.length}</Badge>
        </h2>
      )}
      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-4 text-sm text-ink-muted">No reminders here.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => {
            const done = r.is_done === 1;
            return (
              <li
                key={r.id}
                id={`reminder-${r.id}`}
                className={cn(
                  'glass relative flex items-center justify-between gap-4 rounded-[var(--radius-md)] px-5 py-3.5 transition-[box-shadow,opacity] duration-500',
                  highlight === r.id && '!border-gold',
                  group === 'overdue' && clearing !== r.id && 'glow-danger',
                  group === 'today' && 'glow-ember'
                )}
                style={{ borderLeftWidth: 4, borderLeftColor: style.tone }}
              >
                {group === 'overdue' && (
                  <span className="pointer-events-none absolute inset-y-0 right-40 w-40 transition-opacity duration-500" style={{ opacity: clearing === r.id ? 0 : 1 }}>
                    <Smoke />
                  </span>
                )}
                <div className="min-w-0">
                  <div className={cn('text-sm font-medium', done ? 'text-ink-muted line-through' : 'text-ink')}>{r.message}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <StatusPill status={r.entity_type}>
                      <span className="normal-case">{r.entity_type === 'lead' ? 'Lead' : 'Project'}: {r.entity_name || `ID ${r.entity_id}`}</span>
                    </StatusPill>
                    <span className="inline-flex items-center gap-1 text-ink-muted tabular"><CalendarDays className="size-3.5" />{formatDate(r.due_date)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!done && <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={() => void finish(r)}>Mark done</Button>}
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(r)} aria-label="Delete reminder">Delete</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddReminderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => Promise<void> }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add reminder">
      {open && <ReminderForm onCancel={() => onOpenChange(false)} onCreated={async () => { onOpenChange(false); await onCreated(); }} />}
    </Dialog>
  );
}

function ReminderForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => Promise<void> }) {
  const entities = useLoad(() => call('reminders:entities'));
  const [message, setMessage] = useState('');
  const [entityType, setEntityType] = useState<EntityType>('lead');
  const [entityId, setEntityId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(todayString());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lost leads are excluded by the backend, as in v1
  const options: EntityOption[] = (entityType === 'lead' ? entities.data?.leads : entities.data?.projects) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return setError('Message is required');
    if (!entityId) return setError('Please select a lead or project');
    if (!dueDate) return setError('Due date is required');
    setBusy(true);
    setError(null);
    try {
      await call('reminders:create', { entity_type: entityType, entity_id: entityId, message: message.trim(), due_date: dueDate });
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label="Message *" htmlFor="rm-message">
        <Input id="rm-message" autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Call client for deposit confirmation" />
      </Field>
      <div className="grid grid-cols-5 gap-3">
        <Field label="For a" className="col-span-2">
          <Select
            value={entityType}
            onChange={(v) => { setEntityType(v); setEntityId(null); }}
            options={[{ value: 'lead', label: 'Lead' }, { value: 'project', label: 'Project' }]}
            label="Entity type"
          />
        </Field>
        <Field label={entityType === 'lead' ? 'Lead *' : 'Project *'} className="col-span-3">
          <Combobox
            value={entityId}
            onChange={setEntityId}
            options={options.map((o) => ({ value: o.id, label: o.name }))}
            placeholder={entities.loading ? 'Loading…' : options.length ? `Choose a ${entityType}` : `No ${entityType}s available`}
            emptyText={`No ${entityType}s match`}
          />
        </Field>
      </div>
      <Field label="Due date *" htmlFor="rm-due"><DateInput id="rm-due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      {error && <p className="text-sm text-st-lost" role="alert">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Create reminder</Button>
      </div>
    </form>
  );
}
