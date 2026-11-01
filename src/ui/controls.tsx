import { useMemo, useState, type ReactNode } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import * as RadixSwitch from '@radix-ui/react-switch';
import * as RadixSlider from '@radix-ui/react-slider';
import * as RadixTabs from '@radix-ui/react-tabs';
import * as RadixPopover from '@radix-ui/react-popover';
import { Check, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/format.ts';

// ── Select ────────────────────────────────────────────────────────────────

export interface Option<V extends string = string> {
  value: V;
  label: ReactNode;
}

export interface SelectProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: Option<V>[];
  id?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<V extends string>({ value, onChange, options, id, label, disabled, className }: SelectProps<V>) {
  return (
    <RadixSelect.Root value={value} onValueChange={(v) => onChange(v as V)} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-label={label}
        className={cn(
          'inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-elev px-3 text-sm text-ink',
          'cursor-pointer focus:border-gold focus:outline-none disabled:opacity-60',
          className
        )}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon><ChevronDown className="size-4 text-ink-muted" /></RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-bg-elev shadow-xl">
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded px-2 py-1.5 pl-7 text-sm text-ink outline-none data-[highlighted]:bg-surface-2"
              >
                <RadixSelect.ItemIndicator className="absolute left-2"><Check className="size-3.5 text-gold-ink" /></RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

// ── Combobox: searchable pick-one for long lists ──────────────────────────

export interface ComboboxProps {
  value: number | null;
  onChange: (value: number) => void;
  options: { value: number; label: string }[];
  placeholder?: string;
  emptyText?: string;
  id?: string;
}

const COMBO_LIMIT = 80;

export function Combobox({ value, onChange, options, placeholder = 'Choose…', emptyText = 'No matches', id }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return filtered.slice(0, COMBO_LIMIT);
  }, [options, query]);

  const choose = (v: number) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <RadixPopover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); setActive(0); }}>
      <RadixPopover.Trigger
        id={id}
        className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-elev px-3 text-left text-sm text-ink cursor-pointer focus:border-gold focus:outline-none"
      >
        <span className={cn('truncate', !selected && 'text-ink-muted')}>{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" />
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align="start"
          sideOffset={4}
          className="z-[70] w-[var(--radix-popover-trigger-width)] rounded-md border border-border bg-bg-elev shadow-xl"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active].value); }
            }}
            placeholder="Type to search…"
            role="combobox"
            aria-expanded
            aria-controls="combobox-list"
            className="h-9 w-full border-b border-border bg-transparent px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <div id="combobox-list" role="listbox" className="max-h-64 overflow-y-auto p-1">
            {matches.length === 0 && <div className="px-2 py-3 text-sm text-ink-muted">{emptyText}</div>}
            {matches.map((o, i) => (
              <div
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink',
                  i === active && 'bg-surface-2'
                )}
              >
                <Check className={cn('size-3.5 text-gold-ink', o.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{o.label}</span>
              </div>
            ))}
            {matches.length === COMBO_LIMIT && <div className="px-2 py-1.5 text-xs text-ink-muted">Keep typing to narrow the list</div>}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

// ── Checkbox, Switch, Slider ──────────────────────────────────────────────

export function Checkbox({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; disabled?: boolean; id?: string }) {
  return (
    <label className={cn('inline-flex items-center gap-2.5 text-sm select-none', disabled ? 'opacity-60' : 'cursor-pointer', checked ? 'text-ink' : 'text-ink-muted')}>
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onChange(c === true)}
        className="flex size-4 shrink-0 items-center justify-center rounded border border-border bg-bg-elev data-[state=checked]:border-gold data-[state=checked]:bg-accent cursor-pointer"
      >
        <RadixCheckbox.Indicator><Check className="size-3 text-on-accent" strokeWidth={3} /></RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, description, disabled, id }: {
  checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <label htmlFor={id} className={cn('min-w-0', disabled ? 'opacity-60' : 'cursor-pointer')}>
        <div className="text-sm text-ink">{label}</div>
        {description && <div className="mt-0.5 text-xs text-ink-muted">{description}</div>}
      </label>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="relative h-5 w-9 shrink-0 rounded-full border border-border bg-bg-elev transition-colors data-[state=checked]:border-gold data-[state=checked]:bg-accent cursor-pointer disabled:cursor-not-allowed"
      >
        <RadixSwitch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-ink-muted transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-on-accent" />
      </RadixSwitch.Root>
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, disabled, label }: {
  value: number; onChange: (value: number) => void; min: number; max: number; step?: number; disabled?: boolean; label: string;
}) {
  return (
    <RadixSlider.Root
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={label}
      className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-60"
    >
      <RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-bg-elev">
        <RadixSlider.Range className="absolute h-full bg-gold" />
      </RadixSlider.Track>
      <RadixSlider.Thumb aria-label={label} className="block size-4 rounded-full border-2 border-gold bg-surface shadow cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" />
    </RadixSlider.Root>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────

export function Tabs({ value, onChange, tabs, children, className }: {
  value: string; onChange: (value: string) => void; tabs: { value: string; label: ReactNode }[]; children: ReactNode; className?: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onChange} className={className}>
      <RadixTabs.List className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted cursor-pointer hover:text-ink data-[state=active]:border-gold data-[state=active]:text-ink"
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export const TabPanel = RadixTabs.Content;
