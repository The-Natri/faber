import { useState, type FormEvent } from 'react';
import { call, errorText } from '../../lib/ipc.ts';
import { Button, Dialog, Field, Input, Select, Textarea } from '../../ui/index.ts';
import { CATEGORIES, type Lead, type LeadInput } from '../../../shared/types.ts';

const CATEGORY_OPTIONS = [{ value: '', label: 'No category' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))];

const fromLead = (lead: Lead | null): Record<keyof LeadInput, string> => ({
  name: lead?.name ?? '',
  category: lead?.category ?? '',
  phone: lead?.phone ?? '',
  address: lead?.address ?? '',
  city: lead?.city ?? '',
  owner_name: lead?.owner_name ?? '',
  best_time: lead?.best_time ?? '',
  website_url: lead?.website_url ?? '',
  notes: lead?.notes ?? '',
});

// Add a lead by hand (referrals, walk-ins) or edit any field of an existing one (§7.5)
export function LeadFormDialog({ open, onOpenChange, lead, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null adds a new lead
  lead: Lead | null;
  onSaved: (lead: Lead, flaggedAsChain: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width="max-w-xl"
      title={lead ? 'Edit lead' : 'New lead'}
      description={lead ? undefined : 'For referrals, walk-ins and anyone discovery missed. Enrichment can still look it up on Google Maps.'}>
      {open && <LeadForm key={lead?.id ?? 'new'} lead={lead} onCancel={() => onOpenChange(false)} onSaved={onSaved} />}
    </Dialog>
  );
}

function LeadForm({ lead, onCancel, onSaved }: { lead: Lead | null; onCancel: () => void; onSaved: (lead: Lead, flaggedAsChain: boolean) => void }) {
  const [form, setForm] = useState(() => fromLead(lead));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof LeadInput) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key: keyof LeadInput) => ({ id: `lead-${key}`, value: form[key], onChange: (e: { target: { value: string } }) => set(key)(e.target.value) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() ? v.trim() : null])) as unknown as LeadInput;
    values.name = form.name.trim();
    try {
      if (lead) onSaved(await call('leads:update', { id: lead.id, values }), false);
      else {
        const created = await call('leads:create', values);
        onSaved(created.lead, created.flaggedAsChain);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="lead-name" className="col-span-2"><Input {...input('name')} maxLength={200} required autoFocus /></Field>
        <Field label="Category"><Select value={form.category} onChange={set('category')} options={CATEGORY_OPTIONS} label="Category" /></Field>
        <Field label="Phone" htmlFor="lead-phone"><Input {...input('phone')} maxLength={30} inputMode="tel" /></Field>
        <Field label="Owner or contact" htmlFor="lead-owner_name"><Input {...input('owner_name')} maxLength={100} /></Field>
        <Field label="Best time to reach" htmlFor="lead-best_time"><Input {...input('best_time')} maxLength={100} placeholder="e.g. After 4 pm" /></Field>
        <Field label="Address" htmlFor="lead-address" className="col-span-2"><Input {...input('address')} maxLength={300} /></Field>
        <Field label="City" htmlFor="lead-city"><Input {...input('city')} maxLength={100} /></Field>
        <Field label="Website" htmlFor="lead-website_url"><Input {...input('website_url')} maxLength={300} placeholder="https://" /></Field>
        <Field label="Notes" htmlFor="lead-notes-form" className="col-span-2">
          <Textarea id="lead-notes-form" rows={3} value={form.notes} onChange={(e) => set('notes')(e.target.value)} maxLength={10000} />
        </Field>
      </div>
      {error && <p className="text-sm text-st-lost" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!form.name.trim()}>{lead ? 'Save changes' : 'Add lead'}</Button>
      </div>
    </form>
  );
}
