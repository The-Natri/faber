import { useState, type FormEvent } from 'react';
import { Code2, Sparkles } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { usd } from '../../lib/format.ts';
import { Button, Input, Panel } from '../../ui/index.ts';
import type { PipelineAnswer } from '../../../shared/ai.ts';

const EXAMPLES = [
  'Which category has the most open leads without a website?',
  'What share of leads in each city have been contacted?',
  'Average score by website status, for leads that are not chains',
];

// "Ask your pipeline": Model A answers with Otari code execution over an anonymised summary (counts and
// averages by category, city, website status, stage and score band; no names, numbers or notes).
export function AskPipeline() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PipelineAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setAnswer(await call('ai:askPipeline', { question: text }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <Panel title="Ask your pipeline" subtitle="Answered with code that Otari runs over an anonymised summary of your leads: counts and averages only, no names or numbers. About $0.012 a question.">
      <form onSubmit={submit} className="flex gap-2">
        <Input aria-label="Question about your pipeline" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Which city has the most leads with an outdated website?" />
        <Button type="submit" variant="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={!question.trim()}>Ask</Button>
      </form>
      {!answer && !busy && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((q) => (
            <button key={q} type="button" onClick={() => { setQuestion(q); void ask(q); }}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-ink-muted hover:border-gold hover:text-ink cursor-pointer">{q}</button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-st-lost">{error}</p>}
      {answer && <AnswerView answer={answer} />}
    </Panel>
  );
}

function AnswerView({ answer }: { answer: PipelineAnswer }) {
  const table = answer.table;
  // A simple bar chart when the table is a label column plus one numeric column
  const numeric = table && table.columns.length === 2 && table.rows.every((r) => r[1] !== '' && Number.isFinite(Number(r[1])));
  const max = numeric ? Math.max(...table.rows.map((r) => Number(r[1])), 0) : 0;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-ink">{answer.answer || 'The model returned no written answer; see the computed table and code below.'}</p>
      {table && (
        numeric && max > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label="Computed result">
            {table.rows.map((row) => (
              <li key={row[0]} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs">
                <span className="truncate text-ink">{row[0]}</span>
                <span className="h-2.5 rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${(Number(row[1]) / max) * 100}%`, background: 'var(--hue-won)' }} /></span>
                <span className="tabular text-ink-muted">{row[1]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-muted"><tr>{table.columns.map((c) => <th key={c} className="py-1 pr-3 font-medium">{c}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, i) => <tr key={i} className="border-t border-border">{row.map((cell, j) => <td key={j} className="py-1 pr-3 tabular text-ink">{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )
      )}
      <details className="rounded-md border border-border bg-bg px-3 py-2 text-xs">
        <summary className="flex cursor-pointer items-center gap-1.5 text-ink-muted"><Code2 className="size-3.5" />Code that Otari ran ({answer.code.length} {answer.code.length === 1 ? 'block' : 'blocks'})</summary>
        {answer.code.map((code, i) => <pre key={i} className="mt-2 overflow-x-auto whitespace-pre font-mono text-[0.7rem] text-ink">{code}</pre>)}
        {answer.logs && <><div className="mt-2 text-ink-muted">Output</div><pre className="overflow-x-auto whitespace-pre font-mono text-[0.7rem] text-ink-muted">{answer.logs}</pre></>}
      </details>
      <p className="text-xs text-ink-muted">
        {answer.servedModel ?? 'unknown model'}{answer.provider ? ` on ${answer.provider}` : ''}{answer.fallback ? ' · fallback model used' : ''} · {usd(answer.costUsd)} · over {answer.segments} segments covering {answer.leads} leads
      </p>
    </div>
  );
}
