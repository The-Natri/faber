import { useRef, useState } from 'react';
import { call, errorText } from '../../lib/ipc.ts';
import { useSettings } from '../../lib/settings.ts';
import { Button, Checkbox, Field, Input, Select, Slider, Switch, Textarea, useToast } from '../../ui/index.ts';
import { cn } from '../../lib/format.ts';
import { configureSound, playSound } from '../../lib/sound.ts';
import { CATEGORIES } from '../../../shared/types.ts';
import { SaveBar, SectionPanel, useSectionDraft } from './common.tsx';

export function ProfileSection() {
  const { draft, set, save, saving, dirty, reset } = useSectionDraft('profile');
  return (
    <SectionPanel title="Profile & business" subtitle="Shown on quotes, invoices and outreach messages." footer={<SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Your name" htmlFor="p-name"><Input id="p-name" className="sensitive" value={draft.yourName} onChange={(e) => set({ yourName: e.target.value })} /></Field>
        <Field label="Business name" htmlFor="p-business"><Input id="p-business" value={draft.businessName} onChange={(e) => set({ businessName: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="p-phone"><Input id="p-phone" className="sensitive" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email" htmlFor="p-email"><Input id="p-email" className="sensitive" type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="UPI ID" htmlFor="p-upi" hint="Used for the payment QR on invoices, e.g. name@okicici"><Input id="p-upi" className="sensitive" value={draft.upiId} onChange={(e) => set({ upiId: e.target.value })} /></Field>
        <Field label="Address" htmlFor="p-address"><Input id="p-address" className="sensitive" value={draft.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Invoice prefix" htmlFor="p-inv"><Input id="p-inv" value={draft.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value })} /></Field>
        <Field label="Quote prefix" htmlFor="p-quote"><Input id="p-quote" value={draft.quotePrefix} onChange={(e) => set({ quotePrefix: e.target.value })} /></Field>
      </div>
      <div className="rounded-md border border-border p-4">
        <Switch id="p-gst" checked={draft.gstRegistered} onChange={(v) => set({ gstRegistered: v })} label="GST registered" description="Off by default: invoices then carry no GST lines and no GSTIN." />
        {draft.gstRegistered && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="GSTIN *" htmlFor="p-gstin"><Input id="p-gstin" className="uppercase" value={draft.gstin} onChange={(e) => set({ gstin: e.target.value })} placeholder="33ABCDE1234F1Z5" /></Field>
            <Field label="State" htmlFor="p-state"><Input id="p-state" value={draft.gstState} onChange={(e) => set({ gstState: e.target.value })} placeholder="Tamil Nadu" /></Field>
          </div>
        )}
      </div>
    </SectionPanel>
  );
}

export function HomeBaseSection() {
  const { draft, set, save, saving, dirty, reset } = useSectionDraft('homeBase');
  const toast = useToast();
  const [finding, setFinding] = useState(false);

  const find = async () => {
    setFinding(true);
    try {
      const place = await call('discover:geocode', { location: draft.label });
      set({ lat: place.lat, lon: place.lon });
      toast({ title: 'Location found', description: place.displayName });
    } catch (err) {
      toast({ title: 'Could not find that place', description: errorText(err), tone: 'error' });
    } finally {
      setFinding(false);
    }
  };

  return (
    <SectionPanel title="Home base" subtitle="Your usual starting point, for visit routes and nearby leads." footer={<SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />}>
      <Field label="Place" htmlFor="hb-label">
        <div className="flex gap-2">
          <Input id="hb-label" value={draft.label} onChange={(e) => set({ label: e.target.value, lat: null, lon: null })} placeholder="e.g. RS Puram, Coimbatore" />
          <Button loading={finding} disabled={!draft.label.trim()} onClick={() => void find()}>Find</Button>
        </div>
      </Field>
      <p className="text-sm text-ink-muted tabular">
        {draft.lat != null && draft.lon != null ? `Coordinates: ${draft.lat.toFixed(4)}, ${draft.lon.toFixed(4)}` : 'Not located yet — use Find.'}
      </p>
    </SectionPanel>
  );
}

export function AppearanceSection() {
  const { view, update } = useSettings();
  const toast = useToast();
  const appearance = view!.settings.appearance;
  const change = (values: Record<string, unknown>) =>
    update('appearance', values).catch((err) => toast({ title: 'Could not save', description: errorText(err), tone: 'error' }));
  // The slider moves freely; the value is saved once it settles
  const [volume, setVolumeLocal] = useState(appearance.soundVolume);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setVolume = (v: number) => {
    setVolumeLocal(v);
    configureSound({ soundEnabled: appearance.soundEnabled, soundVolume: v });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void change({ soundVolume: v }), 400);
  };

  return (
    <SectionPanel title="Appearance" subtitle="Changes apply straight away.">
      {/* Two theme cards (G9); choosing one crossfades night ↔ dawn */}
      <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="Theme">
        {([
          { id: 'parchment', name: 'Parchment', line: 'Aged paper and ink — for daylight hours.', bg: '#EBDCBC', panel: '#FAF1DC', ink: '#2A1E12', gold: '#7A5512' },
          { id: 'nocturne', name: 'Nocturne', line: 'Midnight navy and candle gold — for night work.', bg: '#07101C', panel: '#112237', ink: '#F1E6D2', gold: '#F0C27A' },
        ] as const).map((t) => {
          const active = appearance.theme === t.id;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={active} onClick={() => void change({ theme: t.id })}
              className={cn('lift overflow-hidden rounded-[var(--radius-md)] border-2 text-left cursor-pointer', active ? 'border-gold shadow-[var(--glow-gold)]' : 'border-border')}>
              <div className="flex h-24 items-center justify-center" style={{ background: t.bg }}>
                <div className="rounded-md px-5 py-3 text-center" style={{ background: t.panel, boxShadow: `0 0 0 1px ${t.gold}` }}>
                  <div className="font-display text-lg font-semibold tracking-[0.1em]" style={{ color: t.gold }}>{t.name}</div>
                </div>
              </div>
              <div className="bg-surface px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink">{t.name}</span>
                  {active && <span className="text-xs font-semibold text-gold-ink">Active</span>}
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{t.line}</p>
              </div>
            </button>
          );
        })}
      </div>
      <Field label="Density">
        <Select value={appearance.density} onChange={(density) => void change({ density })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} label="Density" />
      </Field>
      <Switch id="ap-motion" checked={appearance.reduceMotion} onChange={(reduceMotion) => void change({ reduceMotion })} label="Reduce motion" description="Turns off decorative animation. Faber also follows the Windows setting." />
      <Switch id="ap-sidebar" checked={appearance.sidebarCollapsed} onChange={(sidebarCollapsed) => void change({ sidebarCollapsed })} label="Collapse the sidebar to icons" />
      <Switch id="ap-recording" checked={appearance.recordingMode} onChange={(recordingMode) => void change({ recordingMode })}
        label="Recording mode (Ctrl+Shift+H)" description="For screen recordings: hides phone numbers, owner names, your sign-off and profile details, and your username. Display only; nothing stored changes." />
      <div className="rounded-md border border-border p-4">
        <Switch id="ap-sound" checked={appearance.soundEnabled} onChange={(soundEnabled) => void change({ soundEnabled })}
          label="Sound effects" description="Soft synthesized sounds for unlocking, the seal stamp, letters sent, the anvil and payments received." />
        <div className={cn('mt-4 flex items-center gap-4', !appearance.soundEnabled && 'opacity-60')}>
          <span className="w-16 text-xs text-ink-muted">Volume</span>
          <Slider value={volume} onChange={(soundVolume) => setVolume(soundVolume)} min={0} max={100} disabled={!appearance.soundEnabled} label="Sound volume" />
          <span className="w-10 text-right text-xs text-ink-muted tabular">{volume}%</span>
          <Button size="sm" disabled={!appearance.soundEnabled} onClick={() => playSound('unlock', true)}>Test</Button>
        </div>
      </div>
    </SectionPanel>
  );
}

export function DiscoveryDefaultsSection() {
  const { draft, set, save, saving, dirty, reset } = useSectionDraft('discovery');
  const toggle = (cat: string) => set({ categories: draft.categories.includes(cat) ? draft.categories.filter((c) => c !== cat) : [...draft.categories, cat] });
  return (
    <SectionPanel title="Discovery defaults" subtitle="What Scrying starts with." footer={<SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />}>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Location" htmlFor="dd-location" className="col-span-2"><Input id="dd-location" value={draft.location} onChange={(e) => set({ location: e.target.value })} /></Field>
        <Field label={<>Radius: <span className="font-semibold text-gold-ink tabular">{draft.radiusKm} km</span></>}>
          <div className="flex h-9 items-center"><Slider value={draft.radiusKm} onChange={(radiusKm) => set({ radiusKm })} min={1} max={50} label="Default radius" /></div>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-muted">Categories</legend>
        <div className="grid grid-cols-4 gap-3">
          {CATEGORIES.map((c) => <Checkbox key={c} checked={draft.categories.includes(c)} onChange={() => toggle(c)} label={c} />)}
        </div>
      </fieldset>
    </SectionPanel>
  );
}

export function OutreachSection() {
  const { draft, set, save, saving, dirty, reset } = useSectionDraft('outreach');
  const [days, setDays] = useState(draft.followUpDays.join(', '));
  const parsed = days.split(',').map((d) => Number(d.trim())).filter((n) => Number.isInteger(n) && n > 0);

  return (
    <SectionPanel
      title="Outreach"
      subtitle="Follow-up rhythm and daily goal for outreach."
      footer={<SaveBar dirty={dirty || days !== draft.followUpDays.join(', ')} saving={saving} onSave={() => void save({ ...draft, followUpDays: parsed })} onReset={() => { reset(); setDays(draft.followUpDays.join(', ')); }} />}
    >
      <div className="grid grid-cols-3 gap-4">
        <Field label="Follow-up days" htmlFor="o-days" hint="Days after first contact, e.g. 3, 7, 14"><Input id="o-days" className="tabular" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Daily goal (contacts)" htmlFor="o-goal"><Input id="o-goal" type="number" min={1} className="tabular" value={draft.dailyGoal} onChange={(e) => set({ dailyGoal: Number(e.target.value) })} /></Field>
        <Field label="Default language">
          <Select value={draft.defaultLanguage} onChange={(defaultLanguage) => set({ defaultLanguage })} options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'Tamil' }]} label="Default language" />
        </Field>
      </div>
      <Field label="Your offer, for AI pitch drafts" htmlFor="o-offer"
        hint="One or two sentences about what you build. It goes to the pitch model, so leave out your name, number and email: Faber adds your sign-off from Profile after the draft is written. AI drafts are English only.">
        <Textarea id="o-offer" rows={3} maxLength={400} value={draft.pitchOffer} onChange={(e) => set({ pitchOffer: e.target.value })} />
      </Field>
    </SectionPanel>
  );
}
