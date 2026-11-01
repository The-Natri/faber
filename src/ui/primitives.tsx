import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/format.ts';
import { useCountUp } from '../lib/motion.ts';
import { Tooltip } from './tooltip.tsx';

// ── Button ────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110 border border-transparent',
  secondary: 'bg-surface-2 text-ink border border-border hover:border-gold',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:text-ink hover:bg-surface-2',
  danger: 'bg-transparent text-st-lost border border-[color-mix(in_oklab,var(--hue-lost)_55%,transparent)] hover:bg-[color-mix(in_oklab,var(--hue-lost)_14%,transparent)]',
  success: 'bg-hue-won text-white border border-transparent hover:brightness-110',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[background-color,border-color,filter,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[0.8rem]' : 'h-9 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, className, children, type = 'button', ...rest },
  ref
) {
  return (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-md cursor-pointer transition-colors duration-150',
          active ? 'bg-surface-2 text-gold-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});

// ── Containers ────────────────────────────────────────────────────────────

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  selected?: boolean;
}

export function Card({ interactive, selected, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'glass rounded-[var(--radius-md)]',
        selected && '!border-gold shadow-[var(--glow-gold)]',
        interactive && 'sheen lift cursor-pointer hover:!border-gold',
        className
      )}
      {...rest}
    />
  );
}

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flourish?: boolean;
}

// A titled section; the flourish variant adds the double rule and corner marks (major panels only)
export function Panel({ title, subtitle, actions, flourish, className, children, ...rest }: PanelProps) {
  return (
    <section className={cn('glass rounded-[var(--radius-md)] p-5', flourish && 'gilt', className)} {...rest}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="font-display text-[0.95rem] font-semibold tracking-wide text-gold-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// ── Small labels ──────────────────────────────────────────────────────────

export function Badge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-surface-2 text-ink-muted', className)} {...rest} />;
}

export function Tag({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-ink-muted', className)} {...rest} />;
}

export function KeyboardHint({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((k) => (
        <kbd key={k} className="rounded border border-border bg-bg-elev px-1.5 py-0.5 font-sans text-[0.7rem] leading-none text-ink-muted">{k}</kbd>
      ))}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

// ── Form fields ───────────────────────────────────────────────────────────

const FIELD = 'w-full rounded-md border border-border bg-bg-elev px-3 text-sm text-ink placeholder:text-ink-muted/70 '
  + 'transition-colors duration-150 focus:border-gold focus:outline-none disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(FIELD, 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(FIELD, 'resize-y py-2 leading-relaxed', className)} {...rest} />;
});

export const DateInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function DateInput({ className, ...rest }, ref) {
  return <input ref={ref} type="date" className={cn(FIELD, 'h-9 tabular', className)} {...rest} />;
});

export interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-muted">{label}</label>
      {children}
      {error ? <p className="text-xs text-st-lost" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

// Counts up from 0 (or from the previous value) to `value`
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-IN') }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <>{format(shown)}</>;
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="glass sheen rounded-[var(--radius-md)] px-4 py-3.5">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular', tone ?? 'text-ink')}>{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'bg-gold', className }: { value: number; tone?: string; className?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-bg-elev', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full origin-left rounded-full transition-transform duration-700 ease-out', tone)} style={{ transform: `scaleX(${value / 100})` }} />
    </div>
  );
}
