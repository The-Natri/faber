import { useEffect, useEffectEvent, useState } from 'react';
import { Globe, Square } from 'lucide-react';
import { call, errorText, subscribe } from '../../lib/ipc.ts';
import { usd } from '../../lib/format.ts';
import { useSettings } from '../../lib/settings.ts';
import { Button, useToast } from '../../ui/index.ts';
import type { WebsiteCheckState } from '../../../shared/ai.ts';
import { VERDICT_LABEL } from './WebsiteBadge.tsx';

const IDLE: WebsiteCheckState = { running: false, processed: 0, total: 0, current: null, results: [], costUsd: 0, error: null };
// A lead without a website_url costs one Otari web search ($0.01) plus small model calls
const COST_PER_LEAD = 0.011;

// AI website check in batches: the next N unchecked open leads, best score first. State is owned by
// main, so a batch keeps going (and stays visible) while you switch views.
export function WebsiteCheckBar({ onFinished }: { onFinished: () => void }) {
  const toast = useToast();
  const { view } = useSettings();
  const batch = view?.settings.integrations.websiteBatchSize ?? 5;
  const [state, setState] = useState<WebsiteCheckState>(IDLE);
  const finished = useEffectEvent(() => onFinished());

  useEffect(() => {
    let cancelled = false;
    let wasRunning = false;
    let processed = 0;
    call('ai:websiteCheckState').then((s) => { if (!cancelled) { setState(s); wasRunning = s.running; processed = s.processed; } }).catch(() => {});
    const off = subscribe('websiteCheck:state', (next) => {
      setState(next);
      // Refresh the list after each finished lead and once more when the batch ends
      if (next.processed !== processed || (wasRunning && !next.running)) finished();
      wasRunning = next.running;
      processed = next.processed;
    });
    return () => { cancelled = true; off(); };
  }, []);

  const start = async () => {
    try {
      await call('ai:startWebsiteChecks', { count: batch });
    } catch (err) {
      toast({ title: 'Website check', description: errorText(err), tone: 'error' });
    }
  };

  const latest = state.results.slice(0, 5);
  return (
    <div className="flex flex-col gap-2.5 border-b border-border bg-bg-elev px-5 py-3.5">
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          icon={<Globe className="size-3.5" />}
          loading={state.running}
          disabled={state.running}
          title={`Each lead: one Otari web search plus small model calls, about ${usd(COST_PER_LEAD)}`}
          onClick={() => void start()}
        >
          {state.running
            ? `Checking websites… ${state.processed}/${state.total}`
            : `Check websites · next ${batch} (≈ ${usd(batch * COST_PER_LEAD)})`}
        </Button>
        {state.running && <Button variant="danger" size="sm" icon={<Square className="size-3" />} onClick={() => void call('ai:stopWebsiteChecks')}>Stop</Button>}
      </div>
      {state.running && state.current && <p className="truncate text-xs text-ink-muted">Now: {state.current.name}</p>}
      {state.error && !state.running && <p role="alert" className="text-xs text-st-lost">{state.error}</p>}
      {latest.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {latest.map((r) => (
            <li key={`${r.leadId}-${r.costUsd}-${r.verdict}`} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink">{r.name}</span>
              <span className="flex shrink-0 items-center gap-2 tabular text-ink-muted">
                <span className={r.error ? 'text-st-lost' : 'text-ink'}>{r.error ? 'Not checked' : VERDICT_LABEL[r.verdict]}</span>
                {r.fallback && <span title="Served by the fallback model">↪</span>}
                <span>{usd(r.costUsd)}</span>
              </span>
            </li>
          ))}
          {state.processed > 0 && <li className="text-right tabular text-ink-muted">Batch cost {usd(state.costUsd)}</li>}
        </ul>
      )}
    </div>
  );
}
