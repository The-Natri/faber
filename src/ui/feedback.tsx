import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '../lib/format.ts';
import { Button } from './primitives.tsx';
import { CompassRose } from './sigils.tsx';

export function EmptyState({ title, line, sigil, action, className }: {
  title: string; line?: string; sigil?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div className="text-gold opacity-70">{sigil ?? <CompassRose size={52} />}</div>
      <div className="font-display text-sm font-semibold tracking-wide text-ink">{title}</div>
      {line && <p className="max-w-sm font-serif text-lg italic leading-snug text-ink-muted">{line}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-7 text-st-lost" aria-hidden />
      <div className="text-sm font-medium text-ink">Something went wrong</div>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
      {onRetry && <Button size="sm" onClick={onRetry} icon={<RotateCcw className="size-3.5" />}>Try again</Button>}
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

// Wraps each top-level view so one broken view never takes down the shell
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[View crashed]', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <ErrorState message={this.state.error.message} onRetry={() => this.setState({ error: null })} className="h-full" />;
    }
    return this.props.children;
  }
}
