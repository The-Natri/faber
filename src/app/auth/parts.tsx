import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Copy, Download } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { cn } from '../../lib/format.ts';
import { useDecor } from '../../lib/motion.ts';
import { BrandMark, Button, Candle, Checkbox, Field, Wordmark, Input, InkWrite, StarDrift, WaxSealShape } from '../../ui/index.ts';
import { passwordStrength, PASSWORD_MIN_LENGTH } from '../password.ts';

export const MOTTO = 'Faber est suae quisque fortunae';

// Night-time workshop behind every signed-out screen: stone gradient, drifting stars, two candles
export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(90% 70% at 50% 38%, #1A2A44 0%, #0B1424 55%, #050A12 100%)' }}>
      <StarDrift />
      <Candle height={120} className="absolute bottom-[12%] left-[7%] hidden opacity-90 md:block" />
      <Candle height={92} className="absolute bottom-[12%] left-[12%] hidden opacity-75 md:block" />
      <Candle height={120} className="absolute bottom-[12%] right-[7%] hidden opacity-90 md:block" />
      <Candle height={92} className="absolute bottom-[12%] right-[12%] hidden opacity-75 md:block" />
      <div className="relative z-10 flex max-h-full w-full justify-center overflow-y-auto p-6">{children}</div>
    </div>
  );
}

// Parchment scroll card (setup, recovery, forced change); rolled wooden ends top and bottom
export function AuthCard({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const decor = useDecor();
  return (
    <AuthBackdrop>
      <motion.div
        className={cn('relative w-full', wide ? 'max-w-xl' : 'max-w-md')}
        initial={decor ? { opacity: 0, y: 14 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <ScrollRod />
        <div className="parchment on-parchment relative mx-2 px-9 py-7 shadow-2xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandMark size={56} variant="light" />
            <h1 className="mt-2"><Wordmark className="text-2xl" /></h1>
            <InkWrite text={MOTTO} className="mt-1 font-serif text-base italic text-ink-muted" />
          </div>
          {children}
        </div>
        <ScrollRod bottom />
      </motion.div>
    </AuthBackdrop>
  );
}

function ScrollRod({ bottom }: { bottom?: boolean }) {
  return (
    <div aria-hidden className={cn('relative z-10 h-4 rounded-full', bottom ? '-mt-1' : '-mb-1')}
      style={{ background: 'linear-gradient(180deg, #8A5E33, #4A2E17 60%, #2E1C0E)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
      <span className="absolute -left-1 top-1/2 size-5 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #E6C27A, #8A6A3A)' }} />
      <span className="absolute -right-1 top-1/2 size-5 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #E6C27A, #8A6A3A)' }} />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border px-3 py-2 text-sm text-st-lost" style={{ borderColor: 'var(--hue-lost)', background: 'color-mix(in oklab, var(--hue-lost) 10%, transparent)' }}>
      {message}
    </p>
  );
}

const STRENGTH_TONE = ['var(--st-lost)', 'var(--st-lost)', 'var(--st-contacted)', 'var(--st-won)'];

// New password + confirmation with a strength hint
export function NewPasswordFields({ password, confirm, onPassword, onConfirm, label = 'New password' }: {
  password: string; confirm: string; onPassword: (v: string) => void; onConfirm: (v: string) => void; label?: string;
}) {
  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <Field label={label} htmlFor="new-password">
        <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => onPassword(e.target.value)} />
        <div className="mt-1 flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full origin-left rounded-full transition-transform duration-300"
                  style={{ backgroundColor: STRENGTH_TONE[strength.score], transform: `scaleX(${strength.score >= i ? 1 : 0})` }} />
              </div>
            ))}
          </div>
          {strength.label && <span className="text-xs font-medium" style={{ color: STRENGTH_TONE[strength.score] }}>{strength.label}</span>}
        </div>
        <p className="text-xs text-ink-muted">{strength.hint}</p>
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password" error={mismatch ? 'Passwords do not match' : null}>
        <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} />
      </Field>
    </>
  );
}

export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password !== confirm) return 'Passwords do not match';
  return null;
}

// The recovery code arrives as a sealed scroll: break the seal to unroll it. Shown once;
// Continue unlocks only after "I've saved it" is ticked.
export function RecoveryCodePanel({ code, onDone, intro, doneLabel = 'Continue' }: {
  code: string; onDone: () => void; intro?: ReactNode; doneLabel?: string;
}) {
  const decor = useDecor();
  const [opened, setOpened] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setNote('Copied to the clipboard');
    } catch {
      setNote('Could not copy — write it down instead');
    }
  };

  const saveFile = async () => {
    try {
      const { path } = await call('auth:saveRecoveryCode', { recoveryCode: code });
      if (path) {
        setNote(`Saved to ${path}`);
        setSaved(true);
      }
    } catch (err) {
      setNote(errorText(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm leading-relaxed text-ink-muted">
        {intro ?? 'If you ever forget your password, this code lets you set a new one. It is shown only once — keep it somewhere safe, away from this computer if you can.'}
      </div>

      {!opened ? (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="group flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#B8966A] py-5 cursor-pointer hover:bg-surface-2"
        >
          <motion.span whileHover={decor ? { rotate: -6, scale: 1.05 } : undefined}>
            <WaxSealShape color="#7A2A2A" size={58}><span className="font-display text-sm font-semibold text-[#F6E4C6]">F</span></WaxSealShape>
          </motion.span>
          <span className="font-display text-sm font-semibold">Break the seal to read your recovery code</span>
        </button>
      ) : (
        <motion.div
          className="origin-top select-all rounded-lg border border-[#B8966A] bg-[rgba(255,250,236,0.7)] py-4 text-center font-mono text-2xl font-semibold tracking-[0.18em] text-[#3A2A14]"
          initial={decor ? { scaleY: 0.05, opacity: 0 } : false}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          {code}
        </motion.div>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" icon={<Copy className="size-4" />} disabled={!opened} onClick={() => void copy()}>Copy</Button>
        <Button className="flex-1" icon={<Download className="size-4" />} disabled={!opened} onClick={() => void saveFile()}>Save as .txt</Button>
      </div>
      {note && <p className="text-xs text-ink-muted" aria-live="polite">{note}</p>}
      <Checkbox checked={saved} onChange={setSaved} label="I've saved my recovery code" disabled={!opened} />
      <Button variant="primary" disabled={!saved} onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
