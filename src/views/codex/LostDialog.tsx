import { useState } from 'react';
import { Dialog, Button, Field, Select, Textarea } from '../../ui/index.ts';
import { LOST_REASON_LABEL, LOST_REASONS, type LostReason } from '../../../shared/pipeline.ts';

const REASON_OPTIONS = LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABEL[r] }));

// Marking lost always asks why (§8.1); "Other" needs a short note
export function LostDialog({ open, onOpenChange, subject, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // e.g. the lead's name, or "3 leads"
  subject: string;
  onConfirm: (reason: LostReason, note: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Mark lost" description={`Why was ${subject} lost? This feeds the funnel and, later, scoring.`}>
      {open && <LostForm onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />}
    </Dialog>
  );
}

function LostForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: LostReason, note: string) => Promise<void> }) {
  const [reason, setReason] = useState<LostReason>('not_interested');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const needsNote = reason === 'other' && !note.trim();

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(reason, note.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Reason"><Select value={reason} onChange={setReason} options={REASON_OPTIONS} label="Reason" /></Field>
      <Field label={reason === 'other' ? 'Note (required)' : 'Note (optional)'} htmlFor="lost-note">
        <Textarea id="lost-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering next time" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="danger" loading={busy} disabled={needsNote} onClick={() => void confirm()}>Mark lost</Button>
      </div>
    </div>
  );
}
