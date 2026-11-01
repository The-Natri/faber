import { useState, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useDecor } from '../lib/motion.ts';
import { cn } from '../lib/format.ts';
import { Button, Input } from './primitives.tsx';

// ── Dialog ────────────────────────────────────────────────────────────────

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
  dismissable?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, children, footer, width = 'max-w-md', dismissable = true }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => (dismissable || next) && onOpenChange(next)}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'flourish rounded-xl bg-surface p-6 shadow-2xl focus:outline-none',
            width
          )}
          onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissable && e.preventDefault()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <RadixDialog.Title className="font-display text-lg font-semibold text-gold-ink">{title}</RadixDialog.Title>
              {description
                ? <RadixDialog.Description className="mt-1 text-sm text-ink-muted">{description}</RadixDialog.Description>
                : <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RadixDialog.Description>}
            </div>
            {dismissable && (
              <RadixDialog.Close className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Close">
                <X className="size-4" />
              </RadixDialog.Close>
            )}
          </div>
          {children}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ── ConfirmDialog (optionally type-to-confirm) ────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  // When set, the confirm button stays disabled until this exact text is typed
  typeToConfirm?: string;
  busy?: boolean;
  canConfirm?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', tone = 'danger', typeToConfirm, busy, canConfirm = true, onConfirm, children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const typedOk = !typeToConfirm || typed === typeToConfirm;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped('');
        onOpenChange(next);
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} disabled={!typedOk || !canConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {typeToConfirm && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label className="text-xs text-ink-muted" htmlFor="type-to-confirm">
            Type <span className="font-semibold text-ink">{typeToConfirm}</span> to confirm
          </label>
          <Input id="type-to-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
      )}
    </Dialog>
  );
}

// ── Drawer (non-modal side panel; Esc closes) ─────────────────────────────
// A parchment page that turns into view; switching items (pageKey) turns a new page.

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
  pageKey?: string | number;
}

export function Drawer({ open, onOpenChange, title, subtitle, children, width = 'w-[440px]', pageKey }: DrawerProps) {
  const decor = useDecor();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn('fixed bottom-0 right-0 top-[56px] z-40 max-w-[calc(100vw-4rem)] [perspective:1800px] focus:outline-none', width)}
        >
          <motion.div
            key={pageKey}
            className="parchment on-parchment flex h-full flex-col border-l-2 shadow-[-14px_0_44px_rgba(0,0,0,0.45)]"
            style={{ borderColor: 'var(--gilt-a)', transformOrigin: 'right center' }}
            initial={decor ? { rotateY: -70, opacity: 0.2 } : false}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.3, 1] }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[rgba(120,80,30,0.25)] px-6 py-5">
              <div className="min-w-0">
                <RadixDialog.Title className="font-display text-lg font-semibold leading-snug text-ink">{title}</RadixDialog.Title>
                <RadixDialog.Description className={subtitle ? 'mt-1 text-sm text-ink-muted' : 'sr-only'}>
                  {subtitle ?? (typeof title === 'string' ? title : 'Details')}
                </RadixDialog.Description>
              </div>
              <RadixDialog.Close className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Close">
                <X className="size-4" />
              </RadixDialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
