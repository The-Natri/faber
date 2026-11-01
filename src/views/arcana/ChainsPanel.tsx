import { useState, type FormEvent } from 'react';
import { Ban, Plus, X } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { useLoad } from '../../lib/useLoad.ts';
import { Badge, Button, ConfirmDialog, ErrorState, Input, Skeleton, useToast } from '../../ui/index.ts';
import type { ChainPattern } from '../../../shared/types.ts';
import { SectionPanel } from './common.tsx';

// Chain blocklist editor (Phase 2a). Adding a name flags the leads it matches; removing one
// unflags the leads only it was holding. Leads unflagged by hand are never re-flagged.
export function ChainsPanel() {
  const toast = useToast();
  const list = useLoad(() => call('chains:list'));
  const [pattern, setPattern] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChainPattern | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    setAdding(true);
    try {
      const { flagged } = await call('chains:add', { pattern });
      toast({ title: `Added “${pattern.trim()}”`, description: flagged ? `${flagged} lead${flagged === 1 ? '' : 's'} flagged as a chain.` : 'No current leads match it.', tone: 'success' });
      setPattern('');
      await list.reload();
    } catch (err) {
      toast({ title: 'Could not add it', description: errorText(err), tone: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const { unflagged } = await call('chains:remove', { id: removing.id });
      toast({ title: `Removed “${removing.pattern}”`, description: unflagged ? `${unflagged} lead${unflagged === 1 ? '' : 's'} unflagged.` : undefined, tone: 'success' });
      setRemoving(null);
      await list.reload();
    } catch (err) {
      toast({ title: 'Could not remove it', description: errorText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionPanel
      title="Chain blocklist"
      subtitle="Leads whose name matches one of these are flagged as chains and hidden from your leads and top opportunities. Matching ignores case, accents and punctuation, and only matches whole words."
    >
      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <Input aria-label="Chain name to block" placeholder="Add a chain name, e.g. Barbeque Nation" value={pattern} maxLength={100} onChange={(e) => setPattern(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={adding} disabled={!pattern.trim()}>Add</Button>
      </form>
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data ? <Skeleton className="h-24" /> : (
        <ul className="flex flex-wrap gap-2" aria-label="Blocked chain names">
          {list.data.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-border bg-bg-elev py-1 pl-3 pr-1 text-sm text-ink">
              <Ban className="size-3.5 text-ink-muted" aria-hidden />
              <span>{p.pattern}</span>
              {p.source === 'manual' && <Badge>added</Badge>}
              {p.matches > 0 && <span className="text-xs text-ink-muted tabular">· {p.matches}</span>}
              <button
                type="button"
                aria-label={`Remove ${p.pattern}`}
                className="ml-0.5 rounded-full p-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
                onClick={() => setRemoving(p)}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove “${removing?.pattern ?? ''}”?`}
        description={removing?.matches
          ? `${removing.matches} flagged lead${removing.matches === 1 ? '' : 's'} match it; they come back to your leads unless another entry still matches them.`
          : 'No flagged leads depend on it.'}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
      />
    </SectionPanel>
  );
}
