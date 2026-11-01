import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { applyAppearance } from '../../lib/settings.ts';
import { cn } from '../../lib/format.ts';
import { Button, Field, Input } from '../../ui/index.ts';
import type { ThemeName } from '../../../shared/settings.ts';
import { AuthCard, FormError, NewPasswordFields, RecoveryCodePanel, newPasswordProblem } from './parts.tsx';

// After sign-in: show a newly issued recovery code (first v2 sign-in), then force a password
// change if the login came from the v1 .env file
// First v2 sign-in (or a .env import): change the password first, then show the new base32
// recovery code once. The old recovery key stops working at that moment.
export function AfterSignIn({ onDone }: { onDone: () => void }) {
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  if (recoveryCode) {
    return (
      <AuthCard>
        <h2 className="mb-1 font-display text-base font-semibold text-ink">Your new recovery code</h2>
        <RecoveryCodePanel
          code={recoveryCode}
          intro="Your password is changed. This code replaces the old recovery key, which no longer works. Use it on the sign-in screen if you ever forget your password. It is shown only once."
          onDone={onDone}
        />
      </AuthCard>
    );
  }
  return <ForcePasswordChange onChanged={(code) => (code ? setRecoveryCode(code) : onDone())} />;
}

function ForcePasswordChange({ onChanged }: { onChanged: (recoveryCode: string | null) => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const { recoveryCode } = await call('auth:changePassword', { currentPassword: current, newPassword: password });
      onChanged(recoveryCode);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <h2 className="mb-1 font-display text-base font-semibold text-ink">Choose a new password</h2>
      <p className="mb-5 text-sm text-ink-muted">
        Welcome to Faber v2. Before you continue, replace your old password with a new one of at least 10 characters.
        You will get a new recovery code next.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Current password" htmlFor="current-password">
          <Input id="current-password" type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <FormError message={error} />
        <Button type="submit" variant="primary" loading={busy}>Save new password</Button>
      </form>
    </AuthCard>
  );
}

// ── First-run onboarding: account → recovery code → business → home base → theme ──

const STEPS = ['Account', 'Recovery code', 'Business', 'Home base', 'Theme'];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  return (
    <AuthCard wide>
      {/* Medallion rail: numbered seals joined by a gilt line */}
      <ol className="relative mb-6 flex items-start justify-between" aria-label="Setup steps">
        <span aria-hidden className="absolute left-[10%] right-[10%] top-[15px] h-px bg-[#B8966A]" />
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5" aria-current={active ? 'step' : undefined}>
              <span className={cn('relative flex size-8 items-center justify-center rounded-full border-2 font-display text-sm font-semibold transition-colors duration-300',
                done ? 'border-[#7A5512] bg-[#7A5512] text-[#FBF3E0]' : active ? 'border-[#7A5512] bg-[#FBF3E0] text-[#6E4C0F]' : 'border-[#B8966A] bg-[#F2DDB8] text-[#8A7458]')}
                style={active ? { boxShadow: '0 0 0 4px rgba(122,85,18,0.18)' } : undefined}>
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn('text-[0.7rem]', active ? 'font-semibold text-ink' : 'text-ink-muted')}>{label}</span>
            </li>
          );
        })}
      </ol>
      {/* Each step reveals like the next page of a journey */}
      <div className="[perspective:1400px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            style={{ transformOrigin: 'left center' }}
            initial={{ opacity: 0, rotateY: -24, x: 24 }}
            animate={{ opacity: 1, rotateY: 0, x: 0 }}
            exit={{ opacity: 0, rotateY: 16, x: -18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {step === 0 && <AccountStep onCreated={(code) => { setRecoveryCode(code); setStep(1); }} />}
            {step === 1 && recoveryCode && <RecoveryCodePanel code={recoveryCode} onDone={() => setStep(2)} />}
            {step === 2 && <BusinessStep onNext={() => setStep(3)} />}
            {step === 3 && <HomeBaseStep onNext={() => setStep(4)} />}
            {step === 4 && <ThemeStep onDone={onDone} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </AuthCard>
  );
}

function AccountStep({ onCreated }: { onCreated: (recoveryCode: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError('Enter a username');
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const { recoveryCode } = await call('auth:onboard', { username: username.trim(), password });
      onCreated(recoveryCode);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Welcome. Create the account that protects your leads, clients and payments.</p>
      <Field label="Username" htmlFor="ob-username"><Input id="ob-username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} label="Password" />
      <FormError message={error} />
      <Button type="submit" variant="primary" loading={busy}>Create account</Button>
    </form>
  );
}

function BusinessStep({ onNext }: { onNext: () => void }) {
  const [form, setForm] = useState({ yourName: '', businessName: "Natri's Faber", phone: '', email: '', upiId: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('settings:update', { section: 'profile', values: form });
      onNext();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Used on quotes, invoices and messages later. You can change all of this in Arcana.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your name" htmlFor="ob-name"><Input id="ob-name" autoFocus value={form.yourName} onChange={(e) => set({ yourName: e.target.value })} /></Field>
        <Field label="Business name" htmlFor="ob-business"><Input id="ob-business" value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="ob-phone"><Input id="ob-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email" htmlFor="ob-email"><Input id="ob-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="UPI ID (optional)" htmlFor="ob-upi" className="col-span-2"><Input id="ob-upi" value={form.upiId} onChange={(e) => set({ upiId: e.target.value })} placeholder="name@bank" /></Field>
      </div>
      <FormError message={error} />
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onNext}>Skip for now</Button>
        <Button type="submit" variant="primary" loading={busy}>Continue</Button>
      </div>
    </form>
  );
}

function HomeBaseStep({ onNext }: { onNext: () => void }) {
  const [location, setLocation] = useState('');
  const [found, setFound] = useState<{ lat: number; lon: number; displayName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookUp = async () => {
    setBusy(true);
    setError(null);
    try {
      setFound(await call('discover:geocode', { location }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!found) return;
    setBusy(true);
    try {
      await call('settings:update', { section: 'homeBase', values: { label: location.trim(), lat: found.lat, lon: found.lon } });
      onNext();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Where you usually start from. Later it is used to plan visit routes and to favour nearby leads.</p>
      <Field label="Home base" htmlFor="ob-home">
        <div className="flex gap-2">
          <Input id="ob-home" autoFocus value={location} onChange={(e) => { setLocation(e.target.value); setFound(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && location.trim()) void lookUp(); }} placeholder="e.g. RS Puram, Coimbatore" />
          <Button onClick={() => void lookUp()} loading={busy && !found} disabled={!location.trim()}>Find</Button>
        </div>
      </Field>
      {found && <p className="text-sm text-ink">Found: <span className="text-ink-muted">{found.displayName}</span></p>}
      <FormError message={error} />
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onNext}>Skip for now</Button>
        <Button variant="primary" disabled={!found} loading={busy && Boolean(found)} onClick={() => void save()}>Continue</Button>
      </div>
    </div>
  );
}

function ThemeStep({ onDone }: { onDone: () => void }) {
  const [theme, setTheme] = useState<ThemeName>('nocturne');
  const [busy, setBusy] = useState(false);

  const choose = (next: ThemeName) => {
    setTheme(next);
    applyAppearance({ theme: next, reduceMotion: false });
  };

  const finish = async () => {
    setBusy(true);
    try {
      await call('settings:update', { section: 'appearance', values: { theme } });
    } finally {
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Pick the workshop you want to work in. You can switch any time from the header.</p>
      <div className="grid grid-cols-2 gap-3">
        {(['nocturne', 'parchment'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => choose(t)}
            aria-pressed={theme === t}
            className={cn('rounded-lg border-2 p-4 text-left cursor-pointer', theme === t ? 'border-gold' : 'border-border')}
          >
            <div className="flex gap-1.5">
              {(t === 'nocturne' ? ['#0A0F1F', '#161F3D', '#C9A646', '#ECE4D0'] : ['#F2E8D0', '#FFF9EA', '#7A5C0E', '#2B2418']).map((c) => (
                <span key={c} className="size-6 rounded-full border border-border" style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="mt-3 font-display text-sm font-semibold capitalize text-ink">{t}</div>
            <div className="text-xs text-ink-muted">{t === 'nocturne' ? 'Midnight navy and gold leaf' : 'Aged paper and ink'}</div>
          </button>
        ))}
      </div>
      <Button variant="primary" loading={busy} onClick={() => void finish()}>Enter the workshop</Button>
    </div>
  );
}
