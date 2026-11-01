import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { cn } from '../lib/format.ts';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'error';
  // e.g. { label: 'Undo', onClick } — soft deletes offer Undo for 8 s
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const UNDO_MS = 8000;
const DEFAULT_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((options: ToastOptions) => {
    setItems((current) => [...current.slice(-3), { ...options, id: Date.now() + Math.random() }]);
  }, []);
  const remove = (id: number) => setItems((current) => current.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            duration={t.duration ?? (t.action ? UNDO_MS : DEFAULT_MS)}
            onOpenChange={(open) => !open && remove(t.id)}
            className={cn(
              'flex items-start gap-3 rounded-lg border bg-bg-elev px-4 py-3 shadow-xl',
              t.tone === 'error' ? 'border-[var(--hue-lost)]' : t.tone === 'success' ? 'border-[var(--hue-won)]' : 'border-border'
            )}
          >
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="text-sm font-medium text-ink">{t.title}</RadixToast.Title>
              {t.description && <RadixToast.Description className="mt-0.5 text-xs text-ink-muted">{t.description}</RadixToast.Description>}
            </div>
            {t.action && (
              <RadixToast.Action
                altText={t.action.label}
                onClick={t.action.onClick}
                className="rounded px-2 py-1 text-sm font-semibold text-gold-ink hover:bg-surface-2 cursor-pointer"
              >
                {t.action.label}
              </RadixToast.Action>
            )}
            <RadixToast.Close aria-label="Dismiss" className="rounded p-0.5 text-ink-muted hover:text-ink cursor-pointer">
              <X className="size-4" />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-[80] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
