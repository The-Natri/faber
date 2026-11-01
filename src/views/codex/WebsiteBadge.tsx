import { cn } from '../../lib/format.ts';
import type { Lead, WebsiteStatus } from '../../../shared/types.ts';
import type { WebsiteVerdict } from '../../../shared/ai.ts';

// For a web designer, no site and an outdated site are the opportunities, so they get the colour
const LOOK: Record<WebsiteStatus, { label: string; hue: string | null }> = {
  none: { label: 'No site', hue: 'var(--hue-won)' },
  outdated: { label: 'Outdated site', hue: 'var(--hue-contacted)' },
  found: { label: 'Has site', hue: null },
  unknown: { label: 'Site unclear', hue: null },
};

export const VERDICT_LABEL: Record<WebsiteVerdict, string> = {
  has_site: 'Has site', no_site: 'No site', outdated_site: 'Outdated site', unknown: 'Site unclear',
};

// Shown once a lead has been checked; an unchecked lead shows nothing
export function WebsiteBadge({ lead, className }: { lead: Pick<Lead, 'website_status' | 'website_checked_at'>; className?: string }) {
  if (lead.website_status === 'unknown' && !lead.website_checked_at) return null;
  const look = LOOK[lead.website_status];
  return (
    <span
      className={cn('rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider', look.hue ? '' : 'border-border text-ink-muted', className)}
      style={look.hue ? { borderColor: look.hue, color: look.hue, background: `color-mix(in oklab, ${look.hue} 12%, transparent)` } : undefined}
    >
      {look.label}
    </span>
  );
}
