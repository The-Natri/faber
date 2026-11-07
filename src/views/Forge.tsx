import { useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, CalendarDays, Plus, Trash2 } from 'lucide-react';
import { call, errorText } from '../lib/ipc.ts';
import { useLoad } from '../lib/useLoad.ts';
import { cn, formatDateTime, rupees } from '../lib/format.ts';
import { useViewRequest, type ViewProps } from '../lib/navigation.ts';
import { playSound } from '../lib/sound.ts';
import {
  Anvil, Badge, Button, DateInput, Dialog, Drawer, EmptyState, ErrorState, Field, Input, Select, Skeleton, SparkBurst, Textarea,
  ViewHeader, useToast,
} from '../ui/index.ts';
import { CATEGORIES, type ProjectStage, type ProjectWithLog } from '../../shared/types.ts';

const STAGES: { id: ProjectStage; label: string }[] = [
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'completed', label: 'Completed' },
];
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c as string, label: c }));
const STAGE_OPTIONS = STAGES.map((s) => ({ value: s.id, label: s.label }));

// v1 moves: forward one stage, back one stage
const MOVES: Record<ProjectStage, { back?: ProjectStage; forward?: ProjectStage }> = {
  ongoing: { forward: 'maintenance' },
  maintenance: { back: 'ongoing', forward: 'completed' },
  completed: { back: 'maintenance' },
};

function deadlineInfo(deadline: string | null): { text: string; className: string } {
  if (!deadline) return { text: 'No deadline', className: 'text-ink-muted' };
  const due = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `Overdue (${Math.abs(days)}d)`, className: 'text-st-lost' };
  if (days <= 7) return { text: `Due in ${days}d`, className: 'text-st-contacted' };
  return { text: `Due ${deadline}`, className: 'text-ink' };
}

const toNumberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

// Forge · Projects — the v1 kanban (ongoing → maintenance → completed) with detail drawer and work log
export default function Forge({ request }: ViewProps) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => call('projects:list'));
  const projects = useMemo(() => data ?? [], [data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [struck, setStruck] = useState<{ id: number; key: number } | null>(null);

  useViewRequest(request, ({ focus, intent }) => {
    if (focus?.type === 'project') setSelectedId(focus.id);
    if (intent === 'new') setAdding(true);
  });

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const fail = (title: string, err: unknown) => toast({ title, description: errorText(err), tone: 'error' });

  const move = async (project: ProjectWithLog, stage: ProjectStage) => {
    try {
      await call('projects:updateStage', { id: project.id, stage });
      await reload();
      // Finishing a project strikes the anvil
      if (stage === 'completed') {
        setStruck((prev) => ({ id: project.id, key: (prev?.key ?? 0) + 1 }));
        playSound('anvil');
      }
      toast({ title: `Moved to ${stage}`, description: project.name });
    } catch (err) {
      fail('Failed to move stage', err);
    }
  };

  const remove = async (project: ProjectWithLog) => {
    try {
      await call('projects:delete', { id: project.id });
      setSelectedId(null);
      await reload();
      toast({
        title: 'Project moved to the trash',
        description: project.name,
        action: {
          label: 'Undo',
          onClick: () => void call('trash:restore', { type: 'project', id: project.id }).then(reload).catch((err) => fail('Could not restore', err)),
        },
      });
    } catch (err) {
      fail('Failed to delete project', err);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pb-5 pt-7">
        <ViewHeader
          themed="Forge"
          plain="Projects"
          line="Client work on the anvil, from first strike to maintenance."
          actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add project</Button>}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="flex flex-1 gap-5 overflow-x-auto px-8 pb-7">
          {STAGES.map((stage) => {
            const items = projects.filter((p) => (p.stage || 'ongoing') === stage.id);
            return (
              <section key={stage.id} className="glass flex min-w-[300px] flex-1 flex-col overflow-hidden rounded-[var(--radius-md)]" aria-label={`${stage.label} projects`}>
                <header className="plank flex items-center justify-between px-4 py-3">
                  <h2 className="font-display text-sm font-semibold tracking-[0.12em]">{stage.label}</h2>
                  <span className="rounded-full bg-[rgba(0,0,0,0.35)] px-2.5 py-0.5 text-xs font-semibold tabular text-[#F0C27A]">{items.length}</span>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto p-3">
                  {loading && !data ? (
                    <Skeleton className="h-32" />
                  ) : items.length === 0 ? (
                    <EmptyState title={`Nothing ${stage.label.toLowerCase()}`} sigil={<Anvil size={44} />} className="py-8" />
                  ) : (
                    items.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        selected={project.id === selectedId}
                        onOpen={() => setSelectedId(project.id)}
                        onMove={(to) => void move(project, to)}
                        struck={struck?.id === project.id ? struck.key : 0}
                      />
                    ))
                  )}
                </div>
                {stage.id === 'ongoing' && (
                  <div className="border-t border-border p-3">
                    <Button variant="ghost" className="w-full" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add project</Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <ProjectDrawer project={selected} onClose={() => setSelectedId(null)} onChanged={reload} onDelete={(p) => void remove(p)} />
      <AddProjectDialog open={adding} onOpenChange={setAdding} onCreated={async () => { await reload(); toast({ title: 'Project created', tone: 'success' }); }} />
    </div>
  );
}

function ProjectCard({ project, selected, onOpen, onMove, struck }: {
  project: ProjectWithLog; selected: boolean; onOpen: () => void; onMove: (stage: ProjectStage) => void; struck: number;
}) {
  const due = deadlineInfo(project.deadline);
  const moves = MOVES[project.stage] ?? MOVES.ongoing;
  const paid = project.payment_agreed ? Math.min(1, (project.payment_received ?? 0) / project.payment_agreed) : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className={cn('parchment on-parchment sheen lift relative flex cursor-pointer flex-col gap-2.5 rounded-md p-3.5',
        selected && 'shadow-[var(--glow-gold)]')}
    >
      <SparkBurst burstKey={struck} />
      {struck > 0 && (
        <motion.span key={struck} aria-hidden className="decor pointer-events-none absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.15, 1, 1] }} transition={{ duration: 1.2, times: [0, 0.2, 0.6, 1] }}>
          <Anvil size={54} className="text-[#B4581F]" />
        </motion.span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-sm font-medium', selected ? 'text-gold-ink' : 'text-ink')}>{project.name}</span>
        <Badge>{project.category || 'General'}</Badge>
      </div>
      {project.scope && <p className="truncate text-xs text-ink-muted">{project.scope}</p>}
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full origin-left rounded-full bg-[#2F9E6B] transition-transform duration-700" style={{ transform: `scaleX(${paid})` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs tabular">
        <span className={project.payment_agreed ? 'text-st-won' : 'text-ink-muted'}>
          {project.payment_agreed ? `${rupees(project.payment_received)} / ${rupees(project.payment_agreed)}` : 'Payment not set'}
        </span>
        <span className={cn('inline-flex items-center gap-1 font-medium', due.className)}><CalendarDays className="size-3.5" />{due.text}</span>
      </div>
      <div className="flex justify-end gap-1.5 border-t border-[rgba(120,80,30,0.25)] pt-2.5" onClick={(e) => e.stopPropagation()}>
        {moves.back && (
          <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={() => onMove(moves.back!)} aria-label={`Move back to ${moves.back}`}>
            <span className="capitalize">{moves.back}</span>
          </Button>
        )}
        {moves.forward && (
          <Button size="sm" variant="secondary" onClick={() => onMove(moves.forward!)} aria-label={`Move to ${moves.forward}`}>
            <span className="capitalize">{moves.forward}</span><ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ProjectForm {
  name: string;
  category: string;
  stage: ProjectStage;
  phone: string;
  scope: string;
  payment_agreed: string;
  payment_received: string;
  deadline: string;
  notes: string;
}

const formFrom = (p: ProjectWithLog): ProjectForm => ({
  name: p.name,
  category: p.category || 'Restaurants',
  stage: p.stage,
  phone: p.phone ?? '',
  scope: p.scope ?? '',
  payment_agreed: p.payment_agreed?.toString() ?? '',
  payment_received: p.payment_received?.toString() ?? '',
  deadline: p.deadline ?? '',
  notes: p.notes ?? '',
});

function ProjectDrawer({ project, onClose, onChanged, onDelete }: {
  project: ProjectWithLog | null; onClose: () => void; onChanged: () => Promise<void>; onDelete: (p: ProjectWithLog) => void;
}) {
  return (
    <Drawer open={project !== null} onOpenChange={(open) => !open && onClose()} title="Project details" subtitle={project?.name} width="w-[460px]" pageKey={project?.id}>
      {project && <ProjectDetail key={project.id} project={project} onChanged={onChanged} onDelete={onDelete} />}
    </Drawer>
  );
}

function ProjectDetail({ project, onChanged, onDelete }: { project: ProjectWithLog; onChanged: () => Promise<void>; onDelete: (p: ProjectWithLog) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<ProjectForm>(() => formFrom(project));
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState('');
  const [logging, setLogging] = useState(false);
  const set = (patch: Partial<ProjectForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await call('projects:update', {
        id: project.id,
        name: form.name,
        category: form.category,
        stage: form.stage,
        phone: form.phone,
        scope: form.scope,
        payment_agreed: toNumberOrNull(form.payment_agreed),
        payment_received: toNumberOrNull(form.payment_received),
        deadline: form.deadline,
        notes: form.notes,
      });
      await onChanged();
      toast({ title: 'Project details saved', tone: 'success' });
    } catch (err) {
      toast({ title: 'Failed to save project', description: errorText(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addEntry = async () => {
    if (!entry.trim()) return;
    setLogging(true);
    try {
      await call('projects:addWorkLog', { project_id: project.id, entry: entry.trim() });
      setEntry('');
      await onChanged();
      toast({ title: 'Work log added' });
    } catch (err) {
      toast({ title: 'Failed to add work log', description: errorText(err), tone: 'error' });
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3.5">
        <Field label="Project name" htmlFor="pd-name"><Input id="pd-name" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={form.category} onChange={(v) => set({ category: v })} options={CATEGORY_OPTIONS} label="Category" /></Field>
          <Field label="Stage"><Select value={form.stage} onChange={(v) => set({ stage: v })} options={STAGE_OPTIONS} label="Stage" /></Field>
        </div>
        <Field label="Phone number" htmlFor="pd-phone"><Input id="pd-phone" className="sensitive" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="e.g. +91 98765 43210" /></Field>
        <Field label="Project scope" htmlFor="pd-scope"><Textarea id="pd-scope" rows={2} value={form.scope} onChange={(e) => set({ scope: e.target.value })} placeholder="Key deliverables and client requirements…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment agreed (₹)" htmlFor="pd-agreed"><Input id="pd-agreed" type="number" min={0} className="tabular" value={form.payment_agreed} onChange={(e) => set({ payment_agreed: e.target.value })} placeholder="0" /></Field>
          <Field label="Payment received (₹)" htmlFor="pd-received"><Input id="pd-received" type="number" min={0} className="tabular" value={form.payment_received} onChange={(e) => set({ payment_received: e.target.value })} placeholder="0" /></Field>
        </div>
        <Field label="Deadline" htmlFor="pd-deadline"><DateInput id="pd-deadline" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="pd-notes"><Textarea id="pd-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Internal notes…" /></Field>
        <Button variant="primary" loading={saving} onClick={() => void save()}>Save project details</Button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-display text-sm font-semibold text-gold-ink">Work log</h3>
        <div className="max-h-52 space-y-2 overflow-y-auto">
          {project.workLog.length === 0 ? (
            <p className="text-sm text-ink-muted">No work logged yet.</p>
          ) : (
            project.workLog.map((log) => (
              <div key={log.id} className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="text-sm text-ink">{log.entry}</div>
                <div className="mt-0.5 text-xs text-ink-muted tabular">{formatDateTime(log.logged_at)}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input aria-label="New work log entry" value={entry} onChange={(e) => setEntry(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addEntry(); }} placeholder="Log activity, milestone update…" />
          <Button loading={logging} disabled={!entry.trim()} onClick={() => void addEntry()}>Add entry</Button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(project)}>Delete project</Button>
      </div>
    </div>
  );
}

const EMPTY_ADD = { name: '', category: 'Restaurants', phone: '', scope: '', payment_agreed: '', deadline: '', notes: '' };

function AddProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState(EMPTY_ADD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof EMPTY_ADD>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Project name is required');
    setBusy(true);
    setError(null);
    try {
      await call('projects:create', {
        name: form.name.trim(),
        category: form.category,
        phone: form.phone,
        scope: form.scope,
        payment_agreed: toNumberOrNull(form.payment_agreed),
        deadline: form.deadline,
        notes: form.notes,
      });
      setForm(EMPTY_ADD);
      onOpenChange(false);
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add new project" width="max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Project name *" htmlFor="np-name" error={error}>
          <Input id="np-name" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Website redesign for a local cafe" />
        </Field>
        <Field label="Category"><Select value={form.category} onChange={(v) => set({ category: v })} options={CATEGORY_OPTIONS} label="Category" /></Field>
        <Field label="Phone number" htmlFor="np-phone"><Input id="np-phone" className="sensitive" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="e.g. +91 98765 43210" /></Field>
        <Field label="Scope" htmlFor="np-scope"><Textarea id="np-scope" rows={2} value={form.scope} onChange={(e) => set({ scope: e.target.value })} placeholder="Deliverables summary…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment agreed (₹)" htmlFor="np-agreed"><Input id="np-agreed" type="number" min={0} className="tabular" value={form.payment_agreed} onChange={(e) => set({ payment_agreed: e.target.value })} placeholder="0" /></Field>
          <Field label="Deadline" htmlFor="np-deadline"><DateInput id="np-deadline" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
        </div>
        <Field label="Notes" htmlFor="np-notes"><Textarea id="np-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Initial project notes…" /></Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Create project</Button>
        </div>
      </form>
    </Dialog>
  );
}
