import { RefreshCw, Sparkles } from 'lucide-react';
import { call } from '../../lib/ipc.ts';
import { useLoad } from '../../lib/useLoad.ts';
import { cn, formatDateTime, usd } from '../../lib/format.ts';
import { Badge, Button, EmptyState } from '../../ui/index.ts';
import type { AiActivity, AiFeature, AiOutcome } from '../../../shared/ai.ts';
import { SectionPanel } from './common.tsx';

const FEATURE: Record<AiFeature, string> = {
  connection_test: 'Connection test',
  screen: 'Input screen',
  website_check: 'Website check',
  pitch: 'Pitch draft',
  pipeline_question: 'Pipeline question',
};

const OUTCOME: Record<AiOutcome, { label: string; tone: string }> = {
  ok: { label: 'OK', tone: 'text-st-won' },
  blocked: { label: 'Blocked by guardrail', tone: 'text-st-lost' },
  budget: { label: 'Spend limit', tone: 'text-st-warn' },
  error: { label: 'Failed', tone: 'text-st-lost' },
};

// AI Activity: every Otari call Faber made, whatever the outcome. Costs come from Otari's inline
// usage.cost_usd; the serving model, provider and fallback from its response headers.
export function AiActivitySection() {
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
  const outcome = OUTCOME[entry.outcome];
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
