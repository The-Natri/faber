import { useMemo, useState, type FormEvent } from 'react';
import { Check, Coins, Plus, Trash2 } from 'lucide-react';
import { call, errorText } from '../lib/ipc.ts';
import { useLoad } from '../lib/useLoad.ts';
import { formatDateTime, percent, rupees } from '../lib/format.ts';
import { useViewRequest, type ViewProps } from '../lib/navigation.ts';
import { playSound } from '../lib/sound.ts';
import {
  BalanceScales, Badge, Button, CountUp, DateInput, Dialog, EmptyState, ErrorState, Field, Input, Panel, ProgressBar, Select, Skeleton, Stat, StatusPill,
  ViewHeader, ViewScroll, useToast,
} from '../ui/index.ts';
import type { Payment, PaymentStatus, PaymentType, ProjectForPayments } from '../../shared/types.ts';

const TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'advance', label: 'Advance' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'final', label: 'Final' },
];
const STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
];

// Treasury · Payments — v1 ledger: totals, per-project progress and milestones, unset projects
export default function Treasury({ request }: ViewProps) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => call('payments:list'));
  const payments = useMemo(() => data?.payments ?? [], [data]);
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const [addFor, setAddFor] = useState<number | null | 'any'>(null);

  useViewRequest(request, ({ intent }) => {
    if (intent === 'new') setAddFor('any');
  });

  const totalAgreed = projects.reduce((sum, p) => sum + (p.payment_agreed || 0), 0);
  const totalReceived = projects.reduce((sum, p) => sum + (p.payment_received || 0), 0);
  const outstanding = Math.max(0, totalAgreed - totalReceived);
  const withPayment = projects.filter((p) => p.payment_agreed && p.payment_agreed > 0);
  const unset = projects.filter((p) => !p.payment_agreed || p.payment_agreed <= 0);

  const fail = (title: string, err: unknown) => toast({ title, description: errorText(err), tone: 'error' });

  const markReceived = async (m: Payment) => {
    try {
      await call('payments:markReceived', { id: m.id });
      playSound('paymentReceived');
      await reload();
      toast({ title: `Milestone ${rupees(m.amount)} marked as received`, tone: 'success' });
    } catch (err) {
      fail('Failed to mark received', err);
    }
  };

  const remove = async (m: Payment) => {
    try {
      await call('payments:delete', { id: m.id });
      await reload();
      toast({
        title: 'Milestone moved to the trash',
        description: `${m.type} · ${rupees(m.amount)}${m.status === 'received' ? ' (no longer counted as received)' : ''}`,
        action: {
          label: 'Undo',
          onClick: () => void call('trash:restore', { type: 'payment', id: m.id }).then(reload).catch((err) => fail('Could not restore', err)),
        },
      });
    } catch (err) {
      fail('Failed to delete milestone', err);
    }
  };

  return (
    <ViewScroll>
      <ViewHeader
        themed="Treasury"
        plain="Payments"
        line="Advances, milestones and what is still owed."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAddFor('any')} disabled={projects.length === 0}>Add milestone</Button>}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          {/* The scales weigh what has come in against what is still owed */}
          <Panel flourish className="mt-7">
            <div className="grid grid-cols-[auto_1fr] items-center gap-8">
              <BalanceScales received={totalReceived} outstanding={outstanding} size={210} />
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Total agreed" value={<CountUp value={totalAgreed} format={rupees} />} tone="text-gold-ink" hint="Sum of all project contracts" />
                <Stat label="Total received" value={<CountUp value={totalReceived} format={rupees} />} tone="text-st-won" hint="Cleared payments" />
                <Stat label="Outstanding balance" value={<CountUp value={outstanding} format={rupees} />} tone={outstanding > 0 ? 'text-st-lost' : 'text-ink-muted'} hint="Pending collection" />
              </div>
            </div>
          </Panel>

          <h2 className="mb-3 mt-8 font-display text-base font-semibold tracking-wide text-ink">Project payment progress</h2>
          {loading && !data ? (
            <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
          ) : withPayment.length === 0 ? (
            <Panel>
              <EmptyState
                title="No agreed payments yet"
                line="Set the agreed payment on a project in the Forge to track its milestones here."
                sigil={<Coins className="size-10" />}
              />
            </Panel>
          ) : (
            <div className="space-y-4">
              {withPayment.map((project) => (
                <ProjectLedger
                  key={project.id}
                  project={project}
                  milestones={payments.filter((p) => p.project_id === project.id)}
                  onAdd={() => setAddFor(project.id)}
                  onMarkReceived={(m) => void markReceived(m)}
                  onDelete={(m) => void remove(m)}
                />
              ))}
            </div>
          )}

          {unset.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-2 text-sm font-semibold text-ink-muted">Projects without an agreed payment</h3>
              <div className="rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-ink-muted">Edit these in the Forge to track their payments here:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {unset.map((p) => <Badge key={p.id} className="text-ink">{p.name} ({p.category || 'General'})</Badge>)}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <AddMilestoneDialog
        projects={projects}
        target={addFor}
        onClose={() => setAddFor(null)}
        onCreated={async () => { await reload(); toast({ title: 'Payment milestone added', tone: 'success' }); }}
      />
    </ViewScroll>
  );
}

function ProjectLedger({ project, milestones, onAdd, onMarkReceived, onDelete }: {
  project: ProjectForPayments; milestones: Payment[]; onAdd: () => void; onMarkReceived: (m: Payment) => void; onDelete: (m: Payment) => void;
}) {
  const agreed = project.payment_agreed || 1;
  const received = project.payment_received || 0;
  const done = percent(received, agreed);

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{project.name}</h3>
            <Badge>{project.category || 'General'}</Badge>
            <StatusPill status={project.stage} />
          </div>
          <p className="mt-1 text-sm font-medium text-st-won tabular">{rupees(received)} received of {rupees(project.payment_agreed)} agreed</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-semibold text-gold-ink tabular">{done}%</span>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={onAdd}>Milestone</Button>
        </div>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-full">
        <ProgressBar value={done} />
        {/* A gold shimmer sweeps the bar whenever the received amount changes */}
        <span key={received} aria-hidden className="decor pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(100deg, transparent 30%, rgba(255,226,160,0.75) 50%, transparent 70%)', animation: 'pill-shimmer 1.1s ease-out 1 both' }} />
      </div>
      {/* Milestones as a parchment ledger */}
      <div className="parchment on-parchment mt-4 overflow-hidden rounded-md">
        {milestones.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-muted">No milestones recorded for this project yet.</p>
        ) : (
          milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4 border-b border-[rgba(120,80,30,0.22)] px-4 py-2.5 last:border-b-0">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <StatusPill status={m.type} />
                <span className="text-base font-semibold text-ink tabular">{rupees(m.amount)}</span>
                <StatusPill status={m.status} />
                {m.status === 'pending' && m.due_date && <span className="text-xs text-ink-muted tabular">Due {m.due_date}</span>}
                {m.status === 'received' && m.received_at && <span className="text-xs text-ink-muted tabular">Received {formatDateTime(m.received_at).split(',')[0]}</span>}
                {m.notes && <span className="truncate text-xs italic text-ink-muted">· {m.notes}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.status === 'pending' && (
                  <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={() => onMarkReceived(m)}>Mark received</Button>
                )}
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(m)} aria-label={`Delete ${m.type} milestone`}>Delete</Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function AddMilestoneDialog({ projects, target, onClose, onCreated }: {
  projects: ProjectForPayments[]; target: number | null | 'any'; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const open = target !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title="Add payment milestone">
      {open && (
        <MilestoneForm
          key={String(target)}
          projects={projects}
          initialProject={target === 'any' ? projects[0]?.id ?? 0 : target}
          onCancel={onClose}
          onCreated={async () => { onClose(); await onCreated(); }}
        />
      )}
    </Dialog>
  );
}

function MilestoneForm({ projects, initialProject, onCancel, onCreated }: {
  projects: ProjectForPayments[]; initialProject: number; onCancel: () => void; onCreated: () => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(String(initialProject));
  const [type, setType] = useState<PaymentType>('advance');
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!amount || !(value > 0)) return setError('Valid amount is required');
    if (!Number(projectId)) return setError('Please select a project');
    setBusy(true);
    setError(null);
    try {
      await call('payments:create', { project_id: Number(projectId), type, status, amount: value, due_date: dueDate, notes });
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label="Target project *">
        <Select value={projectId} onChange={setProjectId} options={projects.map((p) => ({ value: String(p.id), label: `${p.name} (${p.category || 'General'})` }))} label="Target project" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select value={type} onChange={setType} options={TYPE_OPTIONS} label="Type" /></Field>
        <Field label="Status"><Select value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Status" /></Field>
      </div>
      <Field label="Amount (₹) *" htmlFor="ms-amount" error={error}>
        <Input id="ms-amount" type="number" min={1} autoFocus className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" />
      </Field>
      <Field label="Due date (optional)" htmlFor="ms-due"><DateInput id="ms-due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      <Field label="Notes (optional)" htmlFor="ms-notes"><Input id="ms-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 50% upfront payment" /></Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>Add milestone</Button>
      </div>
    </form>
  );
}
