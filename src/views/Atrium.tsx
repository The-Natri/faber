import type { KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { CalendarClock } from 'lucide-react';
import { call } from '../lib/ipc.ts';
import { useLoad } from '../lib/useLoad.ts';
import { formatDate, formatDateTime, percent, rupees, todayString } from '../lib/format.ts';
import { useNavigation } from '../lib/navigation.ts';
import { useDecor } from '../lib/motion.ts';
import {
  CountUp, DustMotes, EmptyState, ErrorState, Hourglass, Panel, RuneStrip, ScoreSeal, Skeleton, Stat, StarDrift, StatusPill, Tag,
  ViewHeader, ViewScroll, WaxSeal,
} from '../ui/index.ts';
import type { DashboardData } from '../../shared/types.ts';
import { AskPipeline } from './atrium/AskPipeline.tsx';

const activate = (fn: () => void) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
});

// Atrium · Dashboard — the v1 rows in the showcase layout
export default function Atrium() {
  const { data, error, loading, reload } = useLoad(() => call('dashboard:get'));

  return (
    <div className="relative h-full">
      <StarDrift className="opacity-60" />
      <DustMotes count={12} />
      <ViewScroll className="relative">
        <ViewHeader themed="Atrium" plain="Dashboard" line="Your business, at a glance." />
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <AtriumSkeleton />
        ) : data ? (
          <AtriumBody data={data} />
        ) : null}
      </ViewScroll>
    </div>
  );
}

function AtriumSkeleton() {
  return (
    <div className="mt-7 space-y-5" aria-busy>
      <div className="grid grid-cols-12 gap-4"><Skeleton className="col-span-5 h-56" /><Skeleton className="col-span-7 h-56" /></div>
      <div className="grid grid-cols-3 gap-5"><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  );
}

function AtriumBody({ data }: { data: DashboardData }) {
  const { navigate } = useNavigation();
  const decor = useDecor();
  const { leadStats, projectCount, topLeads, upcomingReminders, revenueStats, projectsByStage, recentActivity, projectPayments } = data;
  const today = todayString();
  const agreed = revenueStats.total_agreed || 0;
  const received = revenueStats.total_received || 0;
  const outstanding = Math.max(0, agreed - received);
  const totalLeads = leadStats.total || 0;
  const stageCount = (stage: string) => projectsByStage.find((s) => s.stage === stage)?.count ?? 0;

  const funnel = [
    { label: 'New', count: leadStats.new_count, hue: 'var(--hue-new)' },
    { label: 'Contacted', count: leadStats.contacted_count, hue: 'var(--hue-contacted)' },
    { label: 'Won (projects)', count: projectCount, hue: 'var(--hue-won)' },
    { label: 'Lost', count: leadStats.lost_count, hue: 'var(--hue-lost)' },
  ];

  return (
    <div className="mt-7 space-y-5">
      {/* Row 1 — hero hourglass + KPIs */}
      <div className="grid grid-cols-12 gap-4">
        <Panel flourish className="col-span-5 flex flex-col">
          <RuneStrip className="-mt-1 mb-3" opacity={0.35} />
          <div className="flex items-center gap-5">
            <Hourglass fraction={agreed > 0 ? received / agreed : 0} size={124} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[0.95rem] font-semibold tracking-wide text-gold-ink">Revenue cleared</h3>
              <div className="mt-1 font-display text-4xl font-semibold text-ink tabular">
                <CountUp value={percent(received, agreed)} format={(n) => `${Math.round(n)}%`} />
              </div>
              <dl className="mt-3 space-y-1 text-sm tabular">
                <div className="flex justify-between"><dt className="text-ink-muted">Received</dt><dd className="font-semibold text-st-won"><CountUp value={received} format={rupees} /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">Agreed</dt><dd className="font-semibold text-gold-ink"><CountUp value={agreed} format={rupees} /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">Outstanding</dt><dd className={`font-semibold ${outstanding > 0 ? 'text-st-lost' : 'text-ink-muted'}`}><CountUp value={outstanding} format={rupees} /></dd></div>
              </dl>
            </div>
          </div>
        </Panel>
        <div className="col-span-7 grid grid-cols-3 gap-4">
          <Stat label="Total leads" value={totalLeads} tone="text-gold-ink" />
          <Stat label="New leads" value={leadStats.new_count} tone="text-st-new" />
          <Stat label="Contacted" value={leadStats.contacted_count} tone="text-st-contacted" />
          <Stat label="Won (projects)" value={projectCount} tone="text-st-won" />
          <Stat label="Lost leads" value={leadStats.lost_count} tone="text-st-lost" />
          <Stat label="Projects ongoing" value={stageCount('ongoing')} tone="text-ink" />
        </div>
      </div>

      {/* Row 2 — opportunities · pipeline · reminders */}
      <div className="grid grid-cols-3 gap-5">
        <Panel title="Top opportunities" subtitle="Highest-scored leads still open">
          {topLeads.length === 0 ? (
            <EmptyState title="No open opportunities" line="Scry a new district to find businesses without a website." />
          ) : (
            <ul className="space-y-2">
              {topLeads.map((lead, i) => (
                <motion.li key={lead.id} initial={decor ? { opacity: 0, x: -8 } : false} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
                  <div
                    {...activate(() => navigate({ view: 'codex', focus: { type: 'lead', id: lead.id } }))}
                    className="sheen flex w-full items-center gap-3 rounded-md border border-border bg-bg-elev px-3 py-2.5 text-left transition-colors hover:border-gold cursor-pointer"
                  >
                    <ScoreSeal score={lead.score} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{lead.name}</div>
                      <div className="mt-0.5 truncate text-xs text-ink-muted">{[lead.category || 'General', lead.city].filter(Boolean).join(' · ')}</div>
                    </div>
                    <StatusPill status={lead.status} />
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Pipeline" subtitle="Leads and projects by stage">
          <div className="space-y-3">
            {funnel.map((row, i) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-xs text-ink">
                  <span>{row.label}</span>
                  <span className="tabular text-ink-muted"><CountUp value={row.count} /></span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-bg-elev">
                  {/* Bars pour in stage by stage */}
                  <motion.div className="h-full origin-left rounded-full" style={{ backgroundColor: row.hue }}
                    initial={decor ? { scaleX: 0 } : false}
                    animate={{ scaleX: Math.max(percent(row.count, Math.max(totalLeads, projectCount)), row.count ? 2 : 0) / 100 }}
                    transition={{ delay: 0.2 + i * 0.18, duration: 0.7, ease: 'easeOut' }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-border pt-3">
            <div className="text-xs font-semibold text-ink-muted">Projects by stage</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              {(['ongoing', 'maintenance', 'completed'] as const).map((stage) => (
                <div key={stage} className="rounded-md bg-bg-elev px-2 py-2">
                  <div className="text-[0.7rem] capitalize text-ink-muted">{stage}</div>
                  <div className="text-lg font-semibold tabular" style={{ color: `var(--st-${stage === 'ongoing' ? 'new' : stage === 'maintenance' ? 'contacted' : 'won'})` }}>
                    <CountUp value={stageCount(stage)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Upcoming reminders">
          {upcomingReminders.length === 0 ? (
            <EmptyState title="Nothing due" line="The almanac is clear." sigil={<CalendarClock className="size-10" />} />
          ) : (
            <ul className="space-y-2">
              {upcomingReminders.map((r) => {
                const when = r.due_date < today ? 'overdue' : r.due_date === today ? 'today' : 'upcoming';
                return (
                  <li key={r.id}>
                    <div
                      {...activate(() => navigate({ view: 'almanac', focus: { type: 'reminder', id: r.id } }))}
                      className={`w-full rounded-md border border-border bg-bg-elev px-3 py-2.5 text-left transition-colors hover:border-gold cursor-pointer ${when === 'overdue' ? 'glow-danger' : ''}`}
                      style={{ borderLeftWidth: 3, borderLeftColor: `var(--st-${when === 'overdue' ? 'lost' : when === 'today' ? 'contacted' : 'new'})` }}
                    >
                      <div className="text-sm font-medium text-ink">{r.message}</div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <StatusPill status={r.entity_type}>
                          <span className="normal-case">{r.entity_type === 'lead' ? 'Lead' : 'Project'}: {r.entity_name || `ID ${r.entity_id}`}</span>
                        </StatusPill>
                        <StatusPill status={when}><span className="tabular normal-case">{formatDate(r.due_date)}</span></StatusPill>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <AskPipeline />

      {/* Row 3 — per-project revenue · recent activity */}
      <div className="grid grid-cols-5 gap-5">
        <Panel title="Revenue by project" className="col-span-2">
          {projectPayments.length === 0 ? (
            <p className="text-sm text-ink-muted">No projects yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {projectPayments.map((p, i) => (
                <li key={i}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink">{p.name}</span>
                    <span className={`tabular ${p.payment_agreed ? 'text-st-won' : 'text-ink-muted'}`}>
                      {p.payment_agreed ? `${rupees(p.payment_received)} / ${rupees(p.payment_agreed)}` : 'Unset'}
                    </span>
                  </div>
                  {p.payment_agreed ? (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-elev">
                      <motion.div className="h-full origin-left rounded-full bg-gold" initial={decor ? { scaleX: 0 } : false}
                        animate={{ scaleX: percent(p.payment_received ?? 0, p.payment_agreed) / 100 }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" className="col-span-3">
          {recentActivity.length === 0 ? (
            <EmptyState title="No work logged yet" line="Entries from the Forge work log appear here." sigil={<WaxSeal size={48} />} />
          ) : (
            <ul className="divide-y divide-border">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Tag className="shrink-0 text-gold-ink">{a.project_name}</Tag>
                    <span className="truncate text-sm text-ink">{a.entry}</span>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted tabular">{formatDateTime(a.logged_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
