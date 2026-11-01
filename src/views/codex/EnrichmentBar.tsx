import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AlertTriangle, Sparkles, Square } from 'lucide-react';
import { call, errorText, subscribe } from '../../lib/ipc.ts';
import { cn } from '../../lib/format.ts';
import { Button, WritingQuill, useToast } from '../../ui/index.ts';
import type { EnrichmentState } from '../../../shared/types.ts';

const IDLE: EnrichmentState = {
  running: false, logs: [], captchaPending: false, processed: 0, total: 0, stats: { enriched: 0, skipped: 0 }, error: null,
  current: null, step: null, recent: [],
};

// v1 enrichment bar: next-20 batch, stop, CAPTCHA wait-and-retry / skip, live log.
// State is owned by main, so a run started here is still shown after switching views.
export function EnrichmentBar({ pending, onFinished }: { pending: number; onFinished: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<EnrichmentState>(IDLE);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const finished = useEffectEvent(() => onFinished());

  useEffect(() => {
    let cancelled = false;
    call('enrichment:getState').then((s) => {
      if (cancelled) return;
      setState(s);
      if (s.running || s.logs.length > 0) setShowLog(true);
    }).catch(() => {});
    const offLog = subscribe('enrichment:log', (line) => setState((s) => ({ ...s, logs: [...s.logs, line] })));
    const offState = subscribe('enrichment:state', (next) => setState(next));
    const offCaptcha = subscribe('enrichment:captcha', () => setState((s) => ({ ...s, captchaPending: true })));
    const offComplete = subscribe('enrichment:complete', () => finished());
    return () => { cancelled = true; offLog(); offState(); offCaptcha(); offComplete(); };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.logs.length]);

  const act = async (channel: 'enrichment:run' | 'enrichment:stop' | 'enrichment:retry' | 'enrichment:skip') => {
    try {
      if (channel === 'enrichment:run') setShowLog(true);
      if (channel === 'enrichment:retry' || channel === 'enrichment:skip') setState((s) => ({ ...s, captchaPending: false }));
      await call(channel);
    } catch (err) {
      toast({ title: 'Enrichment', description: errorText(err), tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-bg-elev px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink"><span className="tabular">{pending}</span> leads pending enrichment</span>
        <span className="flex items-center gap-3 text-xs font-semibold tabular">
          <span className="text-st-won">Enriched: {state.stats.enriched}</span>
          <span className="text-ink-muted">Skipped: {state.stats.skipped}</span>
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          icon={state.running ? <WritingQuill writing raised={state.captchaPending} size={15} /> : <Sparkles className="size-3.5" />}
          disabled={state.running}
          onClick={() => void act('enrichment:run')}
        >
          {state.running ? `Enriching… ${state.processed}/${state.total}` : 'Enrich next 20 leads'}
        </Button>
        {state.running && (
          <Button variant="danger" size="sm" icon={<Square className="size-3" />} onClick={() => void act('enrichment:stop')}>Stop</Button>
        )}
      </div>

      {state.captchaPending && (
        <div className="flex flex-col gap-2 rounded-md border px-3 py-2.5" style={{ borderColor: 'var(--hue-contacted)', background: 'color-mix(in oklab, var(--hue-contacted) 12%, transparent)' }} role="alert">
          <span className="flex items-center gap-2 text-sm font-medium text-st-contacted">
            <AlertTriangle className="size-4" /> CAPTCHA detected on Google Maps — waiting for you
          </span>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => void act('enrichment:retry')}>Wait &amp; retry (15s)</Button>
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => void act('enrichment:skip')}>Skip this lead</Button>
          </div>
        </div>
      )}

      {state.error && !state.running && (
        <div className="rounded-md border px-3 py-2.5 text-sm text-st-lost" style={{ borderColor: 'var(--hue-lost)' }} role="alert">
          {state.error}
        </div>
      )}

      {showLog && (
        <div ref={logRef} className="h-28 overflow-y-auto rounded-md border border-border bg-bg px-3 py-2 font-mono text-[0.72rem] leading-relaxed" aria-live="polite">
          {state.logs.length === 0
            ? <div className="text-ink-muted">Waiting for enrichment logs…</div>
            : state.logs.map((line, i) => (
              <div key={i} className={cn('break-words', line.includes('❌') ? 'text-st-lost' : line.includes('✅') ? 'text-st-won' : 'text-ink-muted')}>{line}</div>
            ))}
        </div>
      )}
    </div>
  );
}
