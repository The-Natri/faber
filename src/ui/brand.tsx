import { cn } from '../lib/format.ts';
import markDark from '../../assets/brand/faber-logo/faber-mark-dark.svg';
import markLight from '../../assets/brand/faber-logo/faber-mark-light.svg';

// The Faber mark, used exactly as delivered in assets/brand/faber-logo/ (never redrawn or
// recoloured). dark: navy disc, for the nocturne theme and dark surfaces. light: transparent,
// for parchment surfaces and the parchment theme. auto picks by theme and surface in CSS.
// (faber-mark-mono.svg is reserved for quote/invoice PDFs, Phase 5.)
export function BrandMark({ size = 40, variant = 'auto', className }: {
  size?: number;
  variant?: 'auto' | 'dark' | 'light';
  className?: string;
}) {
  const img = (src: string, which: 'dark' | 'light') => (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={cn('shrink-0 select-none', variant === 'auto' && `brand-mark-${which}`, className)}
    />
  );
  if (variant === 'dark') return img(markDark, 'dark');
  if (variant === 'light') return img(markLight, 'light');
  return <>{img(markDark, 'dark')}{img(markLight, 'light')}</>;
}

// The name beside the mark: live text in Cinzel 600 with wide tracking, never an image
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-display font-semibold uppercase tracking-[0.16em]', className)}>Natri&apos;s Faber</span>;
}
