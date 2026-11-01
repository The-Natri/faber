import { useEffect, useState, type ReactNode } from 'react';
import * as RadixHover from '@radix-ui/react-popover';
import { motion } from 'motion/react';
import { cn } from '../lib/format.ts';
import { useDecor } from '../lib/motion.ts';
import { WaxSealShape } from './arcane.tsx';
import { playSound } from '../lib/sound.ts';

// Every status-like value maps to one tone: text uses the AA-checked --st-* colour,
// the fill is the brief's base hue at low strength.
type Tone = 'new' | 'contacted' | 'replied' | 'meeting' | 'proposal' | 'won' | 'lost';

const TONES: Record<string, Tone> = {
  new: 'new', contacted: 'contacted', replied: 'replied', meeting: 'meeting', proposal: 'proposal', won: 'won', lost: 'lost',
  ongoing: 'new', maintenance: 'contacted', completed: 'won',
  pending: 'contacted', received: 'won',
  advance: 'new', milestone: 'replied', final: 'won',
  lead: 'new', project: 'replied',
  overdue: 'lost', today: 'contacted', upcoming: 'new', done: 'won',
  enriched: 'won', review: 'contacted', failed: 'lost', skipped: 'meeting',
};

export function toneStyle(value: string) {
  const tone = TONES[value] ?? 'new';
  return {
    color: `var(--st-${tone})`,
    backgroundColor: `color-mix(in oklab, var(--hue-${tone}) 18%, transparent)`,
  };
}

// Colour morphs on change, with a one-off shimmer sweep (transform only)
export function StatusPill({ status, children, className }: { status: string; children?: ReactNode; className?: string }) {
  const [initial] = useState(status);
  const changed = status !== initial;
  return (
    <span
      style={toneStyle(status)}
      className={cn(
        'relative inline-flex items-center overflow-hidden rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize leading-5 transition-colors duration-500',
        className
      )}
    >
      {children ?? status}
      {changed && (
        <span key={status} aria-hidden className="decor pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)', animation: 'pill-shimmer 700ms ease-out 1 both' }} />
      )}
    </span>
  );
}

// ── Score seal: a wax seal stamped by tier; hover unfolds the breakdown ───

export type ScoreTier = 'Prime' | 'Promising' | 'Faint' | 'Unscored';

export function scoreTier(score: number | null): ScoreTier {
  if (score == null) return 'Unscored';
  if (score >= 70) return 'Prime';
  if (score >= 40) return 'Promising';
  return 'Faint';
}

const SEAL_COLOR: Record<ScoreTier, string> = {
  Prime: '#1F7A55',
  Promising: '#A8681F',
  Faint: '#8E2F37',
  Unscored: '#5A5E68',
};

export interface ScoreSealProps {
  score: number | null;
  size?: 'sm' | 'md';
  // Lines for the breakdown; scoring v2 (Phase 4) supplies per-factor points
  breakdown?: string[];
  // Stamp in on mount (first appearance in a drawer)
  stamp?: boolean;
}

export function ScoreSeal({ score, size = 'md', breakdown, stamp }: ScoreSealProps) {
  const decor = useDecor();
  const [open, setOpen] = useState(false);
  const tier = scoreTier(score);
  const px = size === 'sm' ? 34 : 44;
  // The stamp lands with a wax thump (only when sound is on)
  useEffect(() => {
    if (!stamp) return;
    const timer = setTimeout(() => playSound('sealStamp'), 180);
    return () => clearTimeout(timer);
  }, [stamp]);
  const lines = breakdown ?? (score == null
    ? ['Not scored yet — enrich this lead to score it.']
    : ['Rating (up to 40)', 'Reviews (up to 20)', 'Phone (20) · Social presence (10)', 'No website (10)']);

  return (
    <RadixHover.Root open={open} onOpenChange={setOpen}>
      <RadixHover.Trigger asChild>
        <motion.button
          type="button"
          aria-label={score == null ? 'Not scored — show details' : `Score ${Math.round(score)}, ${tier} — show breakdown`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => e.stopPropagation()}
          className="relative shrink-0 cursor-help rounded-full"
          initial={stamp && decor ? { scale: 1.9, opacity: 0, rotate: -18 } : false}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.15 }}
        >
          {tier === 'Prime' && (
            <span aria-hidden className="decor pointer-events-none absolute -inset-1.5 rounded-full"
              style={{ boxShadow: '0 0 14px 3px rgba(240,194,122,0.55)', animation: 'seal-glow 3.2s ease-in-out infinite' }} />
          )}
          <WaxSealShape color={SEAL_COLOR[tier]} size={px}>
            <span className={cn('font-display font-semibold text-[#FBF0DA] tabular', size === 'sm' ? 'text-[0.72rem]' : 'text-sm')}
              style={{ textShadow: '0 1px 0 rgba(0,0,0,0.45)' }}>
              {score == null ? '—' : Math.round(score)}
            </span>
          </WaxSealShape>
        </motion.button>
      </RadixHover.Trigger>
      <RadixHover.Portal>
        <RadixHover.Content
          side="right"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="parchment z-[60] w-60 origin-left rounded-md px-4 py-3 shadow-xl"
          style={{ animation: decor ? 'unfold 220ms ease-out both' : undefined }}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-display text-sm font-semibold">{tier}</span>
            <span className="font-display text-lg font-semibold tabular">{score == null ? '—' : `${Math.round(score)}`}<span className="text-xs text-parchment-muted">/100</span></span>
          </div>
          <div className="my-2 h-px bg-[rgba(90,60,30,0.25)]" />
          <ul className="space-y-1 text-xs text-parchment-muted">
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <style>{'@keyframes unfold{from{transform:scaleX(.6) scaleY(.2);opacity:0}to{transform:none;opacity:1}}'}</style>
        </RadixHover.Content>
      </RadixHover.Portal>
    </RadixHover.Root>
  );
}
