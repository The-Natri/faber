import { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Download, FolderOpen, History, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useDecor } from '../../lib/motion.ts';
import { call, errorText } from '../../lib/ipc.ts';
import { useLoad } from '../../lib/useLoad.ts';
import { formatDateTime } from '../../lib/format.ts';
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Panel, Skeleton, Vial, WaxSealShape, useToast } from '../../ui/index.ts';
import type { ExportEntity, RestoreCandidate, TrashItem } from '../../../shared/types.ts';
import { SaveBar, SectionPanel, useSectionDraft } from './common.tsx';
import { ChainsPanel } from './ChainsPanel.tsx';

const sizeText = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// ── Backups (N2 left) ─────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  auto: 'Daily backup',
  manual: 'Manual backup',
  'pre-migration': 'Before an update',
  'pre-restore': 'Before a restore',
  'pre-reset': 'Before a reset',
};

function agoText(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (days < 2) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  return formatDateTime(iso);
}

export function BackupsSection() {
  const toast = useToast();
  const overview = useLoad(() => call('backup:list'));
  const keepDraft = useSectionDraft('backups');
  const [busy, setBusy] = useState<string | null>(null);
  const [vial, setVial] = useState<'idle' | 'filling' | 'done'>('idle');
  const [candidate, setCandidate] = useState<RestoreCandidate | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      await overview.reload();
      if (success) toast({ title: success, tone: 'success' });
    } catch (err) {
      toast({ title: 'Backup action failed', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // The vial fills with ink while the backup is written, then corks
  const backUpNow = async () => {
    setVial('filling');
    setBusy('create');
    try {
      const [{ name }] = await Promise.all([call('backup:create'), new Promise((r) => setTimeout(r, 1200))]);
      setVial('done');
      await overview.reload();
      toast({ title: 'Backup written', description: name, tone: 'success' });
      setTimeout(() => setVial('idle'), 1800);
    } catch (err) {
      setVial('idle');
      toast({ title: 'Backup failed', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const inspect = async (key: string, fn: () => Promise<RestoreCandidate | null>) => {
    setBusy(key);
    try {
      const picked = await fn();
      if (picked) setCandidate(picked);
    } catch (err) {
      toast({ title: 'That backup cannot be restored', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!candidate) return;
    setBusy('restore');
    try {
      await call('backup:restore', { file: candidate.file });
      // Faber relaunches itself
    } catch (err) {
      toast({ title: 'Restore failed', description: errorText(err), tone: 'error' });
      setBusy(null);
    }
  };

  const data = overview.data;
  return (
    <div className="flex flex-col gap-5">
      <Panel flourish>
        <header className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-2"><Vial state={vial} size={46} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold text-ink">Backups</h3>
            <p className="font-serif text-base italic text-ink-muted">Your past states, always within reach.</p>
          </div>
        </header>

        {overview.error ? <ErrorState message={overview.error} onRetry={overview.reload} /> : !data ? <Skeleton className="mt-4 h-40" /> : (
          <>
            {data.backups.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">No backups yet. Faber makes one each day while it runs.</p>
            ) : (
              <ul className="mt-4 max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border bg-bg-elev">
                {data.backups.map((b) => (
                  <li key={b.name} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="shrink-0"><Vial state="done" size={28} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{KIND_LABEL[b.kind] ?? b.kind}</div>
                      <div className="truncate text-xs text-ink-muted tabular">{agoText(b.created_at)} · {sizeText(b.size_bytes)}</div>
                    </div>
                    <Button size="sm" variant="secondary" className="!border-[var(--success)] !text-success"
                      loading={busy === `inspect-${b.name}`} onClick={() => void inspect(`inspect-${b.name}`, () => call('backup:inspect', { name: b.name }))}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="primary" className="mt-4 w-full" icon={<Save className="size-4" />} loading={busy === 'create'} onClick={() => void backUpNow()}>
              Back up now
            </Button>
          </>
        )}
      </Panel>

      {data && (
        <SectionPanel title="Where backups are kept">
          <Field label="Backup folder" hint="Choosing a folder inside your Google Drive sync folder gives you off-machine copies.">
            <div className="flex gap-2">
              <Input readOnly value={data.folder} className="font-mono text-xs" aria-label="Backup folder" />
              <Button loading={busy === 'folder'} onClick={() => void act('folder', () => call('backup:chooseFolder'))}>Choose…</Button>
              {!data.is_default_folder && <Button variant="ghost" onClick={() => void act('reset', () => call('backup:resetFolder'), 'Using the default folder')}>Use default</Button>}
            </div>
          </Field>
          <div className="flex items-end gap-3">
            <Field label="Keep the newest" htmlFor="bk-keep" className="w-40">
              <Input id="bk-keep" type="number" min={1} max={365} className="tabular" value={keepDraft.draft.keep} onChange={(e) => keepDraft.set({ keep: Number(e.target.value) })} />
            </Field>
            <span className="pb-2 text-sm text-ink-muted">daily and manual backups (safety copies are never removed)</span>
            {keepDraft.dirty && <SaveBar dirty saving={keepDraft.saving} onSave={() => void keepDraft.save().then(() => overview.reload())} onReset={keepDraft.reset} />}
          </div>
          <div className="flex gap-2">
            <Button icon={<FolderOpen className="size-4" />} onClick={() => void call('backup:openFolder')}>Open folder</Button>
            <Button icon={<History className="size-4" />} loading={busy === 'pick'} onClick={() => void inspect('pick', () => call('backup:pickRestoreFile'))}>Restore from file…</Button>
          </div>
        </SectionPanel>
      )}

      <ConfirmDialog
        open={candidate !== null}
        onOpenChange={(open) => !open && setCandidate(null)}
        title="Restore this backup?"
        tone="primary"
        confirmLabel="Restore and restart"
        busy={busy === 'restore'}
        onConfirm={() => void restore()}
        description="Your current data is backed up first, then replaced by this file. Faber restarts afterwards."
      >
        {candidate && (
          <div className="space-y-3 text-sm">
            <p className="break-all font-mono text-xs text-ink-muted">{candidate.file}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(candidate.counts).map(([table, n]) => <Badge key={table} className="tabular text-ink">{n} {table}</Badge>)}
            </div>
            <p className="text-ink-muted">Saved API keys and tokens are tied to the computer they were entered on. After restoring on a different computer, enter them again in Integrations.</p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

// ── Data: export, trash, factory reset ────────────────────────────────────

export function DataSection() {
  return (
    <div className="flex flex-col gap-5">
      <ExportPanel />
      <ChainsPanel />
      <TrashPanel />
      <FactoryReset />
    </div>
  );
}

function ExportPanel() {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportEntity | null>(null);
  const exportCsv = async (entity: ExportEntity) => {
    setBusy(entity);
    try {
      const { path, rows } = await call('export:csv', { entity });
      if (path) toast({ title: `Exported ${rows} ${entity}`, description: path, tone: 'success' });
    } catch (err) {
      toast({ title: 'Export failed', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <SectionPanel title="Export as CSV" subtitle="Opens in Excel or Google Sheets. Deleted items and stored credentials are never exported.">
      <div className="flex flex-wrap gap-2">
        {(['leads', 'projects', 'payments', 'reminders'] as const).map((entity) => (
          <Button key={entity} icon={<Download className="size-4" />} loading={busy === entity} onClick={() => void exportCsv(entity)}>
            <span className="capitalize">{entity}</span>
          </Button>
        ))}
      </div>
    </SectionPanel>
  );
}

function TrashPanel() {
  const toast = useToast();
  const trash = useLoad(() => call('trash:list'));
  const [purging, setPurging] = useState<TrashItem | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = async (item: TrashItem) => {
    try {
      await call('trash:restore', { type: item.type, id: item.id });
      await trash.reload();
      toast({ title: 'Restored', description: item.title, tone: 'success' });
    } catch (err) {
      toast({ title: 'Could not restore', description: errorText(err), tone: 'error' });
    }
  };

  const purge = async () => {
    if (!purging) return;
    setBusy(true);
    try {
      await call('trash:purge', { type: purging.type, id: purging.id });
      setPurging(null);
      await trash.reload();
    } catch (err) {
      toast({ title: 'Could not delete', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionPanel title="Trash" subtitle="Deleted items stay here for 30 days, then they are removed for good.">
      {trash.error ? <ErrorState message={trash.error} onRetry={trash.reload} /> : !trash.data ? <Skeleton className="h-20" /> : trash.data.length === 0 ? (
        <EmptyState title="The trash is empty" sigil={<Trash2 className="size-9" />} className="py-6" />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {trash.data.map((item) => (
            <li key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{item.title}</div>
                <div className="truncate text-xs text-ink-muted">
                  {item.subtitle} · deleted {formatDateTime(item.deleted_at)} · {item.days_left} {item.days_left === 1 ? 'day' : 'days'} left
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => void restore(item)}>Restore</Button>
                <Button size="sm" variant="danger" onClick={() => setPurging(item)}>Delete forever</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => !open && setPurging(null)}
        title="Delete forever?"
        description={purging?.type === 'project'
          ? `“${purging.title}” and its work log, payments and reminders will be removed permanently.`
          : `“${purging?.title ?? ''}” will be removed permanently.`}
        confirmLabel="Delete forever"
        busy={busy}
        onConfirm={() => void purge()}
      />
    </SectionPanel>
  );
}

// ── Factory reset (N2 centre); the confirm step cracks a wax seal ─────────

const RESET_PHRASE = 'RESET FABER';
const ERASED = ['All leads and projects', 'Payments, reminders and work logs', 'Settings and preferences', 'Saved API keys and tokens'];

function FactoryReset() {
  const decor = useDecor();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  // The seal cracks a little more with each correct third of the phrase
  const correct = RESET_PHRASE.startsWith(typed) ? typed.length : 0;
  const cracks = Math.floor((correct / RESET_PHRASE.length) * 3 + 0.0001);
  const ready = typed === RESET_PHRASE && password.length > 0;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTyped('');
      setPassword('');
      setError(null);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      setDissolving(true);
      await new Promise((r) => setTimeout(r, decor ? 900 : 0));
      await call('data:factoryReset', { confirmText: 'RESET FABER', password });
      // Faber relaunches into the setup wizard
    } catch (err) {
      setDissolving(false);
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Panel flourish>
        <header className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md text-st-contacted" style={{ background: 'color-mix(in oklab, var(--hue-contacted) 18%, transparent)' }}>
            <AlertTriangle className="size-6" />
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">Factory reset</h3>
            <p className="text-sm text-ink-muted">This permanently removes your data and restores the default settings.</p>
          </div>
        </header>
        <ul className="mt-4 space-y-1.5 text-sm">
          {ERASED.map((item) => (
            <li key={item} className="flex items-center gap-2 text-ink"><Check className="size-4 text-success" />{item}</li>
          ))}
          <li className="flex items-center gap-2 text-gold-ink"><Save className="size-4" />A final backup is kept in your backup folder</li>
        </ul>
        <button type="button" onClick={() => setOpen(true)}
          className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-danger-fill font-medium text-white transition-[filter] hover:brightness-110 cursor-pointer">
          <AlertTriangle className="size-4" /> Reset everything…
        </button>
        <p className="mt-3 text-center font-serif text-base italic text-ink-muted">Every craft begins again from a clean anvil.</p>
      </Panel>

      <Dialog open={open} onOpenChange={close} title="Break the seal?" dismissable={!busy}>
        <div className="parchment on-parchment flex flex-col items-center gap-4 rounded-md px-5 py-5">
          <WaxSealShape color="#7A2A2A" size={78} cracks={cracks}>
            <span className="font-display text-xl font-semibold text-[#F6E4C6]">F</span>
          </WaxSealShape>
          <p className="text-center text-sm text-ink-muted">
            Type <span className="font-semibold text-ink">{RESET_PHRASE}</span> and your password to erase everything. A final backup is taken first.
          </p>
          <Field label="Confirmation" htmlFor="fr-phrase" className="w-full">
            <Input id="fr-phrase" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} placeholder={RESET_PHRASE} />
          </Field>
          <Field label="Your password" htmlFor="fr-password" className="w-full" error={error}>
            <Input id="fr-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>Cancel</Button>
          <button type="button" disabled={!ready || busy} onClick={() => void reset()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-danger-fill px-4 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
            Erase and restart
          </button>
        </div>
      </Dialog>

      {/* The screen dissolves to the setup wizard */}
      {dissolving && (
        <motion.div className="fixed inset-0 z-[100] bg-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: decor ? 0.85 : 0 }} aria-hidden />
      )}
    </>
  );
}
