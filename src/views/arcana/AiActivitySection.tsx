import { Gauge, RefreshCw, Sparkles } from 'lucide-react';
import { call } from '../../lib/ipc.ts';
import { useLoad } from '../../lib/useLoad.ts';
import { cn, formatDateTime, usd } from '../../lib/format.ts';
import { Badge, Button, EmptyState } from '../../ui/index.ts';
import type { AiActivity, AiFeature, AiOutcome, SpendCategory } from '../../../shared/ai.ts';
import { SectionPanel } from './common.tsx';

const FEATURE: Record<AiFeature, string> = {
  connection_test: 'Connection test',
  screen: 'Input screen',
  web_search: 'Web search',
  website_check: 'Website check',
  name_match: 'Name match',
  pitch: 'Pitch draft',
  pipeline_question: 'Pipeline question',
};

const OUTCOME: Record<AiOutcome, { label: string; tone: string }> = {
  ok: { label: 'OK', tone: 'text-st-won' },
  blocked: { label: 'Blocked by guardrail', tone: 'text-st-lost' },
  budget: { label: 'Spend limit', tone: 'text-st-warn' },
  error: { label: 'Failed', tone: 'text-st-lost' },
};

export function AiActivitySection() {
  return (
    <div className="flex flex-col gap-5">
      <SpendMeter />
      <ActivityLog />
    </div>
  );
}

const CATEGORY_LABEL: Record<SpendCategory, string> = {
  website_check: 'Website check (search + decision)',
  name_match: 'Name match',
  pitch: 'Pitch drafts',
  screener: 'Screener (gpt-oss-safeguard)',
  other: 'Other (connection tests)',
};

// This month's AI spend, from Otari's inline cost on every call, against Faber's own cap.
// Otari's ceilings live in the Otari dashboard; an API key can't read them, so they're explained, not shown.
function SpendMeter() {
  const spend = useLoad(() => call('ai:spend'));
  const s = spend.data;
  const share = s && s.capUsd > 0 ? Math.min(100, (s.totalUsd / s.capUsd) * 100) : 100;
  return (
    <SectionPanel
      title="AI spend this month"
      subtitle={s ? `${s.monthLabel} · ${s.calls} calls` : 'Loading…'}
      medallion={<Gauge className="size-5" />}
      footer={<Button variant="ghost" icon={<RefreshCw className="size-4" />} loading={spend.loading} onClick={() => void spend.reload()}>Refresh</Button>}
    >
      {spend.error && <p className="text-sm text-st-lost">{spend.error}</p>}
      {s && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-2xl font-semibold tabular text-ink">{usd(s.totalUsd)}</span>
              <span className="text-sm text-ink-muted tabular">of Faber's cap {usd(s.capUsd)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)} aria-label="Share of Faber's monthly cap used">
              <div className="h-full rounded-full" style={{ width: `${share}%`, background: s.capReached ? 'var(--hue-lost)' : 'var(--hue-won)' }} />
            </div>
            {s.capReached && (
              <p role="alert" className="text-sm text-st-lost">Faber's cap is reached: AI features use their non-AI paths (templates, no checks) until next month, or until you raise the cap in Integrations.</p>
            )}
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {(Object.keys(CATEGORY_LABEL) as SpendCategory[]).map((key) => (
              <li key={key} className="flex justify-between gap-3">
                <span className="text-ink">{CATEGORY_LABEL[key]}</span>
                <span className="tabular text-ink-muted">{s.byCategory[key].calls} calls · {usd(s.byCategory[key].usd)}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3 text-xs leading-relaxed">
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="mb-1 font-semibold text-ink">Faber's limit (this app)</div>
              The monthly cap above, set in Integrations. Faber checks it before every paid call and doesn't call Otari once it's reached.
              It's counted from Otari's own cost figure on each call.
            </div>
            <div className="rounded-md border border-border px-3 py-2.5">
              <div className="mb-1 font-semibold text-ink">Otari's limits (Otari dashboard)</div>
              Spend ceilings and budgets on the organization or on this key, and the account balance. Faber can't read them;
              when Otari refuses a call, it shows below as "Otari spend limit" and AI features fall back the same way.
            </div>
          </div>
        </>
      )}
    </SectionPanel>
  );
}

// AI Activity: every Otari call Faber made, whatever the outcome. Costs come from Otari's inline
// usage.cost_usd; the serving model, provider and fallback from its response headers.
function ActivityLog() {
  const page = useLoad(() => call('ai:activity', { limit: 200 }));
  const totals = page.data?.totals;

  return (
    <SectionPanel
      title="AI Activity"
      subtitle="Every call to the Otari gateway: which model was asked, which one answered, whether a fallback or the guardrail stepped in, and what it cost."
      medallion={<Sparkles className="size-5" />}
    >
      <div className="flex items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2"><dt className="text-ink-muted">Calls</dt><dd className="tabular text-ink">{totals?.calls ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-ink-muted">Spend</dt><dd className="tabular text-ink">{totals ? usd(totals.cost_usd) : '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-ink-muted">Fallbacks</dt><dd className="tabular text-ink">{totals?.fallbacks ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-ink-muted">Blocked</dt><dd className="tabular text-ink">{totals?.blocked ?? '—'}</dd></div>
        </dl>
        <Button variant="ghost" icon={<RefreshCw className="size-4" />} loading={page.loading} onClick={() => void page.reload()}>Refresh</Button>
      </div>

      {page.error && <p className="text-sm text-st-lost">{page.error}</p>}
      {page.data && page.data.entries.length === 0 && (
        <EmptyState title="No AI calls yet" line="Use Test connection under Integrations, or any AI feature, and each call appears here." />
      )}
      {page.data && page.data.entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Feature</th>
                <th className="py-2 pr-3 font-medium">Asked → served</th>
                <th className="py-2 pr-3 font-medium">Guardrail</th>
                <th className="py-2 pr-3 font-medium">Outcome</th>
                <th className="py-2 pr-3 text-right font-medium">Tokens</th>
                <th className="py-2 pr-3 text-right font-medium">Cost</th>
                <th className="py-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {page.data.entries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}

function ActivityRow({ entry }: { entry: AiActivity }) {
  // A spend refusal says whose limit it was: Faber's own cap, or one of Otari's
  const outcome = entry.outcome === 'budget'
    ? { ...OUTCOME.budget, label: entry.error_code === 'faber_cap' ? "Faber's cap" : 'Otari spend limit' }
    : OUTCOME[entry.outcome];
  const tokens = entry.prompt_tokens === null ? '—' : `${entry.prompt_tokens} / ${entry.completion_tokens ?? 0}`;
  return (
    <tr className="border-t border-border align-top" title={entry.request_id ? `Otari-Request-ID ${entry.request_id}` : undefined}>
      <td className="whitespace-nowrap py-2 pr-3 text-ink-muted">{formatDateTime(entry.created_at)}</td>
      <td className="py-2 pr-3 text-ink">{FEATURE[entry.feature] ?? entry.feature}</td>
      <td className="py-2 pr-3">
        <span className="font-mono text-xs text-ink-muted">{entry.model_requested}</span>
        {entry.model_served && (
          <span className="block font-mono text-xs text-ink">→ {entry.model_served}{entry.provider ? ` · ${entry.provider}` : ''}</span>
        )}
        {entry.fallback === 1 && <Badge className="mt-1">Fallback · {entry.attempt_count ?? '?'} attempts</Badge>}
      </td>
      <td className="py-2 pr-3 text-ink-muted">{entry.guardrail === 'not_reported' ? '—' : entry.guardrail}</td>
      <td className={cn('py-2 pr-3', outcome.tone)}>
        {outcome.label}
        {entry.error_code && entry.outcome !== 'ok' && <span className="block font-mono text-xs text-ink-muted">{entry.error_code}</span>}
      </td>
      <td className="tabular py-2 pr-3 text-right text-ink-muted">{tokens}</td>
      <td className="tabular py-2 pr-3 text-right text-ink">{usd(entry.cost_usd)}</td>
      <td className="tabular py-2 text-right text-ink-muted">{entry.latency_ms} ms</td>
    </tr>
  );
}
