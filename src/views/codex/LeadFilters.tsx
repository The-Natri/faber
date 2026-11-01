import { useState } from 'react';
import { ChevronDown, RotateCcw, Search } from 'lucide-react';
import { cn } from '../../lib/format.ts';
import { Button, Field, Input, Select, Switch } from '../../ui/index.ts';
import { ACTIVE_STAGES, LEAD_STATUSES, STAGE_LABEL, type LeadStatus } from '../../../shared/pipeline.ts';
import { CATEGORIES, DEFAULT_LEAD_FILTERS, type LeadFacets, type LeadFilters as Filters, type LeadSort, type WebsiteStatus } from '../../../shared/types.ts';

const ANY = '__any';
const CATEGORY_OPTIONS = [{ value: ANY, label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))];
const SCORE_OPTIONS = [
  { value: '0-100', label: 'Any' },
  { value: '70-100', label: 'Prime (70+)' },
  { value: '40-69.99', label: 'Promising (40–69)' },
  { value: '0-39.99', label: 'Faint (under 40)' },
];
const WEBSITE_OPTIONS: { value: WebsiteStatus | typeof ANY; label: string }[] = [
  { value: ANY, label: 'Any' },
  { value: 'none', label: 'No website' },
  { value: 'found', label: 'Has a website' },
  { value: 'outdated', label: 'Outdated website' },
  { value: 'unknown', label: 'Unknown or not checked' },
];
const SORT_OPTIONS: { value: LeadSort; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'newest', label: 'Newest' },
  { value: 'last_contacted', label: 'Last contact' },
];

// Stages as toggles. An empty selection would mean "active stages" on the backend, so the
// stage set always holds at least one stage here.
export const stagesOf = (filters: Filters): LeadStatus[] => (filters.stages.length ? filters.stages : ACTIVE_STAGES);

export function LeadFilters({ filters, onChange, facets }: { filters: Filters; onChange: (next: Filters) => void; facets: LeadFacets | null }) {
  const [more, setMore] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const stages = stagesOf(filters);
  const toggleStage = (stage: LeadStatus) => {
    const next = stages.includes(stage) ? stages.filter((s) => s !== stage) : LEAD_STATUSES.filter((s) => s === stage || stages.includes(s));
    if (next.length) set({ stages: next });
  };
  const extra = [
    filters.scoreMin > 0 || filters.scoreMax < 100,
    filters.tags.length > 0,
    filters.starredOnly,
    filters.websiteStatus !== null,
    filters.showChains,
    filters.sort !== 'score',
  ].filter(Boolean).length;
  const isDefault = JSON.stringify({ ...filters, stages }) === JSON.stringify({ ...DEFAULT_LEAD_FILTERS, stages: ACTIVE_STAGES });

  const cityOptions = [{ value: ANY, label: 'All cities' }, ...(facets?.cities ?? []).map((c) => ({ value: c, label: c }))];
  const tagOptions = [{ value: ANY, label: 'Any' }, ...(facets?.tags ?? []).map((t) => ({ value: t, label: t }))];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input aria-label="Search leads by name" placeholder="Search name, phone or owner…" value={filters.search} onChange={(e) => set({ search: e.target.value })} className="pl-9" />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stages">
        {LEAD_STATUSES.map((stage) => {
          const on = stages.includes(stage);
          return (
            <button
              key={stage}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStage(stage)}
              className={cn('cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                on ? 'border-transparent' : 'border-border text-ink-muted hover:text-ink')}
              style={on ? { color: `var(--st-${stage})`, backgroundColor: `color-mix(in oklab, var(--hue-${stage}) 20%, transparent)` } : undefined}
            >
              {STAGE_LABEL[stage]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><Select value={filters.category ?? ANY} onChange={(v) => set({ category: v === ANY ? null : v })} options={CATEGORY_OPTIONS} label="Category" /></Field>
        <Field label="City"><Select value={filters.city ?? ANY} onChange={(v) => set({ city: v === ANY ? null : v })} options={cityOptions} label="City" /></Field>
      </div>

      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" aria-expanded={more} onClick={() => setMore((m) => !m)}
          icon={<ChevronDown className={cn('size-3.5 transition-transform', more && 'rotate-180')} />}>
          More filters{extra > 0 ? ` (${extra})` : ''}
        </Button>
        {!isDefault && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onChange(DEFAULT_LEAD_FILTERS)}>Reset</Button>
        )}
      </div>

      {more && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Score">
              <Select value={`${filters.scoreMin}-${filters.scoreMax}`} label="Score"
                onChange={(v) => { const [min, max] = v.split('-').map(Number); set({ scoreMin: min, scoreMax: max }); }}
                options={SCORE_OPTIONS} />
            </Field>
            <Field label="Tag"><Select value={filters.tags[0] ?? ANY} onChange={(v) => set({ tags: v === ANY ? [] : [v] })} options={tagOptions} label="Tag" /></Field>
            <Field label="Website"><Select value={filters.websiteStatus ?? ANY} onChange={(v) => set({ websiteStatus: v === ANY ? null : v })} options={WEBSITE_OPTIONS} label="Website" /></Field>
            <Field label="Sort by"><Select value={filters.sort} onChange={(v) => set({ sort: v })} options={SORT_OPTIONS} label="Sort by" /></Field>
          </div>
          <Switch id="starred-only" checked={filters.starredOnly} onChange={(v) => set({ starredOnly: v })} label="Starred only" />
          <Switch id="show-chains" checked={filters.showChains} onChange={(v) => set({ showChains: v })} label="Show chains" description="Blocklisted chains and leads marked not a fit" />
        </div>
      )}
    </div>
  );
}
