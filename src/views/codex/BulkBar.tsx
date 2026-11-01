import { useState } from 'react';
import { BellPlus, Download, Star, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { Button, DateInput, Dialog, Field, Input, Select, Switch } from '../../ui/index.ts';
import { LEAD_STATUSES, STAGE_LABEL, type LeadStatus } from '../../../shared/pipeline.ts';
import type { BulkLeadAction } from '../../../shared/types.ts';

const MOVE_PLACEHOLDER = '__move';
// Won stays one lead at a time (each one creates a project)
const MOVE_OPTIONS = [
  { value: MOVE_PLACEHOLDER, label: 'Move to…' },
  ...LEAD_STATUSES.filter((s) => s !== 'won').map((s) => ({ value: s, label: STAGE_LABEL[s] })),
];

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Multi-select actions for Codex (§7.5). The parent runs each action and reports skips.
export function BulkBar({ count, onAction, onMoveLost, onExport, onClear }: {
  count: number;
  onAction: (action: BulkLeadAction, label: string) => Promise<void>;
  // Lost needs a reason, so the parent opens the lost dialog
  onMoveLost: () => void;
  onExport: () => Promise<void>;
  onClear: () => void;
}) {
  const [dialog, setDialog] = useState<'tag' | 'followUp' | null>(null);
  const [tag, setTag] = useState('');
  const [addTag, setAddTag] = useState(true);
  const [due, setDue] = useState(() => inDays(3));
  const [message, setMessage] = useState('Follow up');
  const [busy, setBusy] = useState(false);

  const run = async (action: BulkLeadAction, label: string) => {
    setBusy(true);
    try {
      await onAction(action, label);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const move = (to: string) => {
    if (to === MOVE_PLACEHOLDER) return;
    if (to === 'lost') onMoveLost();
    else void run({ type: 'move', to: to as Exclude<LeadStatus, 'won'> }, `Moved to ${STAGE_LABEL[to as LeadStatus]}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5" role="toolbar" aria-label="Bulk actions">
      <span className="mr-1 text-sm font-medium text-ink tabular">{count} selected</span>
      <Select value={MOVE_PLACEHOLDER} onChange={move} options={MOVE_OPTIONS} label="Move selected leads to" className="h-8 w-32 text-xs" />
      <Button size="sm" icon={<TagIcon className="size-3.5" />} onClick={() => setDialog('tag')}>Tag</Button>
      <Button size="sm" icon={<Star className="size-3.5" />} onClick={() => void run({ type: 'star', starred: true }, 'Starred')}>Star</Button>
      <Button size="sm" variant="ghost" onClick={() => void run({ type: 'star', starred: false }, 'Unstarred')}>Unstar</Button>
      <Button size="sm" icon={<BellPlus className="size-3.5" />} onClick={() => setDialog('followUp')}>Follow-up</Button>
      <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => void onExport()}>Export CSV</Button>
      <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => void run({ type: 'delete' }, 'Moved to the trash')}>Delete</Button>
      <Button size="sm" variant="ghost" className="ml-auto" icon={<X className="size-3.5" />} onClick={onClear}>Clear</Button>

      <Dialog open={dialog === 'tag'} onOpenChange={(open) => !open && setDialog(null)} title={`Tag ${count} lead${count === 1 ? '' : 's'}`}>
        <div className="flex flex-col gap-4">
          <Field label="Tag" htmlFor="bulk-tag"><Input id="bulk-tag" maxLength={30} value={tag} onChange={(e) => setTag(e.target.value)} autoFocus /></Field>
          <Switch id="bulk-tag-mode" checked={addTag} onChange={setAddTag} label={addTag ? 'Add this tag' : 'Remove this tag'} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!tag.trim()}
              onClick={() => void run({ type: 'tag', tag: tag.trim(), add: addTag }, addTag ? `Tagged “${tag.trim()}”` : `Removed “${tag.trim()}”`)}>
              {addTag ? 'Add tag' : 'Remove tag'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === 'followUp'} onOpenChange={(open) => !open && setDialog(null)} title={`Follow-up for ${count} lead${count === 1 ? '' : 's'}`}
        description="Creates one reminder per lead in the Almanac.">
        <div className="flex flex-col gap-4">
          <Field label="Due" htmlFor="bulk-due"><DateInput id="bulk-due" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Message" htmlFor="bulk-message"><Input id="bulk-message" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!due || !message.trim()}
              onClick={() => void run({ type: 'followUp', dueDate: due, message: message.trim() }, 'Follow-ups created')}>Create follow-ups</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
