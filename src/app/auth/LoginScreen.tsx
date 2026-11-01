import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { call, errorText, IpcCallError } from '../../lib/ipc.ts';
import { BrandMark, Wordmark, Button, Field, InkBlot, InkWrite, Input, RuneStrip, WaxSealShape } from '../../ui/index.ts';
import { AuthBackdrop, AuthCard, FormError, MOTTO, NewPasswordFields, RecoveryCodePanel, newPasswordProblem } from './parts.tsx';

export interface LoginResult {
  mustChangePassword: boolean;
}

// Sign-in, and the lock screen (same screen, shown over the app without reloading it)
export function LoginScreen({ knownUsername, lockedUntil, locked, onSignedIn }: {
  knownUsername: string; lockedUntil: string | null; locked: boolean; onSignedIn: (result: LoginResult) => void;
}) {
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  return mode === 'login'
    ? <SignIn knownUsername={knownUsername} lockedUntil={lockedUntil} locked={locked} onSignedIn={onSignedIn} onForgot={() => setMode('recover')} />
    : <Recover onBack={() => setMode('login')} />;
}

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000)) : 0;
}

function SignIn({ knownUsername, lockedUntil, locked, onSignedIn, onForgot }: {
  knownUsername: string; lockedUntil: string | null; locked: boolean; onSignedIn: (result: LoginResult) => void; onForgot: () => void;
}) {
  const [username, setUsername] = useState(knownUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockout, setLockout] = useState<string | null>(lockedUntil);
  const [fails, setFails] = useState(0);
  const wait = useCountdown(lockout);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await call('auth:login', { username, password });
      setPassword('');
      onSignedIn(result);
    } catch (err) {
      setError(errorText(err));
      setFails((n) => n + 1);
      if (err instanceof IpcCallError && err.code === 'LOCKED_OUT') {
        const status = await call('auth:status').catch(() => null);
        if (status?.state === 'locked') setLockout(status.lockedUntil);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthBackdrop>
      <div className="w-[460px] max-w-full">
        {/* The frame shudders on each failed attempt */}
        <div key={fails} style={fails ? { animation: 'shudder 460ms ease-in-out' } : undefined}>
          <PortraitFrame locked={locked} />
          <div className="relative -mt-2 px-3">
            <div className="parchment on-parchment relative overflow-hidden rounded-b-md px-8 pb-6 pt-7 shadow-2xl">
              {error && <InkBlot key={fails} className="absolute -right-6 -top-4" size={110} />}
              <h2 className="mb-4 text-center font-display text-lg font-semibold">
                {locked ? 'Faber is locked' : 'Enter your password'}
              </h2>
              <form onSubmit={submit} className="relative flex flex-col gap-4">
                <Field label="Username" htmlFor="login-username">
                  <Input id="login-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!knownUsername} />
                </Field>
                <Field label="Password" htmlFor="login-password">
                  <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={Boolean(knownUsername)} />
                </Field>
                <FormError message={wait > 0 ? `Too many failed attempts. Try again in ${wait} s.` : error} />
                <div className="relative">
                  <Button type="submit" variant="primary" className="h-11 w-full pr-12 font-display tracking-wide" loading={busy} disabled={wait > 0 || !username || !password}>
                    Unlock
                  </Button>
                  <span className="pointer-events-none absolute -right-3 top-1/2 -translate-y-1/2">
                    <WaxSealShape color="#7A2A2A" size={46}>
                      <LockKeyhole className="size-4 text-[#F6E4C6]" />
                    </WaxSealShape>
                  </span>
                </div>
                <button type="button" onClick={onForgot} className="self-center text-sm text-gold-ink hover:underline cursor-pointer">
                  Forgot password? Use your recovery code
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AuthBackdrop>
  );
}

// Gilt frame with a keyhole latch: our anvil-and-compass sigil under candlelight
function PortraitFrame({ locked }: { locked: boolean }) {
  return (
    <div className="relative">
      <div className="absolute -top-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        <RuneStrip className="w-20 shrink-0" opacity={0.7} />
        <svg width="50" height="50" viewBox="0 0 46 46" aria-hidden className="shrink-0 drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]">
          <circle cx="23" cy="23" r="21" fill="url(#latch)" stroke="#6E4C1E" strokeWidth="1.5" />
          <defs>
            <radialGradient id="latch" cx="35%" cy="30%"><stop offset="0%" stopColor="#F6D58A" /><stop offset="100%" stopColor="#9C7A1E" /></radialGradient>
          </defs>
          <circle cx="23" cy="20" r="5" fill="#2A1A0A" />
          <path d="M20 23 L18.5 33 H27.5 L26 23 Z" fill="#2A1A0A" />
        </svg>
        <RuneStrip className="w-20 shrink-0" opacity={0.7} />
      </div>
      <div className="gilt relative mx-auto flex h-[220px] w-[78%] flex-col items-center justify-center overflow-hidden rounded-[var(--radius-frame)]"
        style={{ background: 'radial-gradient(70% 70% at 50% 45%, #3A2A1A 0%, #1B140D 70%, #0E0A06 100%)', borderWidth: 6, borderColor: '#B88A4A' }}>
        <div aria-hidden className="decor absolute inset-0" style={{ background: 'radial-gradient(40% 40% at 50% 46%, rgba(255,200,110,0.28), transparent 70%)', animation: 'halo 3.6s ease-in-out infinite' }} />
        {/* The frame is always dark wood, so the dark mark in both themes */}
        <BrandMark size={86} variant="dark" className="relative" />
        <h1 className="relative mt-2"><Wordmark className="text-xl text-[#F3DFC0]" /></h1>
        <InkWrite text={MOTTO} className="relative mt-1 font-serif text-[0.95rem] italic text-[#D9C4A0]" />
        {locked && <span className="relative mt-2 text-[0.7rem] uppercase tracking-[0.16em] text-[#D9C4A0]">Locked · Ctrl+L</span>}
      </div>
    </div>
  );
}

function Recover({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ username: string; recoveryCode: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      setDone(await call('auth:recover', { recoveryCode: code, newPassword: password }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard>
        <h2 className="mb-1 font-display text-base font-semibold text-ink">Password reset</h2>
        <p className="mb-4 text-sm text-ink-muted">Sign in as <strong className="text-ink">{done.username}</strong> with your new password. Your old recovery code no longer works — here is your new one.</p>
        <RecoveryCodePanel code={done.recoveryCode} onDone={onBack} intro=" " doneLabel="Back to sign in" />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h2 className="mb-1 font-display text-base font-semibold text-ink">Reset your password</h2>
      <p className="mb-5 text-sm text-ink-muted">Enter the recovery code you saved when you set up Faber (or since you last reset).</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Recovery code" htmlFor="recovery-code">
          <Input id="recovery-code" autoFocus autoComplete="off" spellCheck={false} className="font-mono tracking-wider" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" />
        </Field>
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <FormError message={error} />
        <Button type="submit" variant="primary" loading={busy} disabled={!code}>Reset password</Button>
        <button type="button" onClick={onBack} className="self-center text-sm text-gold-ink hover:underline cursor-pointer">← Back to sign in</button>
      </form>
    </AuthCard>
  );
}
