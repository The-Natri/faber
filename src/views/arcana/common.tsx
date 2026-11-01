import { useState, type ReactNode } from 'react';
import { errorText } from '../../lib/ipc.ts';
import { useSettings } from '../../lib/settings.ts';
import { Button, Panel, useToast } from '../../ui/index.ts';
import type { AppSettings, SettingsSection } from '../../../shared/settings.ts';

// Local draft of one settings section; save() validates in main and toasts the outcome
export function useSectionDraft<K extends SettingsSection>(section: K) {
  const { view, update } = useSettings();
  const toast = useToast();
  const saved = view!.settings[section] as AppSettings[K];
  const [draft, setDraft] = useState<AppSettings[K]>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = (patch: Partial<AppSettings[K]>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async (values: Partial<AppSettings[K]> = draft) => {
    setSaving(true);
    try {
      const next = await update(section, values as Record<string, unknown>);
      setDraft(next.settings[section] as AppSettings[K]);
      toast({ title: 'Settings saved', tone: 'success' });
      return true;
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err), tone: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { draft, set, save, saving, dirty, reset: () => setDraft(saved) };
}

// A settings card; `medallion` shows an icon in a gilt rune medallion beside the title (G9)
export function SectionPanel({ title, subtitle, children, footer, medallion }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; medallion?: ReactNode;
}) {
  return (
    <Panel title={medallion ? (
      <span className="flex items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#FBF0DA]"
          style={{ background: 'radial-gradient(circle at 35% 30%, #2E8A5E, #14402C)', boxShadow: '0 0 0 2px var(--gilt-a), 0 0 0 4px rgba(0,0,0,0.35)' }}>
          {medallion}
        </span>
        {title}
      </span>
    ) : title} subtitle={subtitle}>
      <div className="flex flex-col gap-4">{children}</div>
      {footer && <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">{footer}</div>}
    </Panel>
  );
}

export function SaveBar({ dirty, saving, onSave, onReset }: { dirty: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <>
      <Button variant="ghost" disabled={!dirty || saving} onClick={onReset}>Discard</Button>
      <Button variant="primary" disabled={!dirty} loading={saving} onClick={onSave}>Save changes</Button>
    </>
  );
}
