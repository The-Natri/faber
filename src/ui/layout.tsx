import type { ReactNode } from 'react';
import { cn } from '../lib/format.ts';

// Top of every view: the themed name in Cinzel with its plain label, an optional line, and actions
export function ViewHeader({ themed, plain, line, actions, className }: {
  themed: string; plain: string; line?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-wide text-gold-ink">{themed}</h1>
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">{plain}</span>
        </div>
        {line && <p className="mt-1 font-serif text-lg italic text-ink-muted">{line}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

// Scrollable page body with the standard gutters
export function ViewScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('h-full overflow-y-auto px-8 py-7', className)}>{children}</div>;
}
