import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

// ── Tooltip ───────────────────────────────────────────────────────────────

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>{children}</RadixTooltip.Provider>;
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-md border border-border bg-bg-elev px-2.5 py-1.5 text-xs text-ink shadow-lg"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
