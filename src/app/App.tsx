import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { call, errorText } from '../lib/ipc.ts';
import { applyAppearance, SettingsContext, type SettingsApi } from '../lib/settings.ts';
import { crossfadeTheme, DecorContext, useOsReducedMotion } from '../lib/motion.ts';
import { configureSound, playSound } from '../lib/sound.ts';
import { BrandMark, ErrorState, ToastProvider, TooltipProvider } from '../ui/index.ts';
import type { AuthStatus } from '../../shared/ipc/contract.ts';
import type { Appearance, SettingsView } from '../../shared/settings.ts';
import { LoginScreen, type LoginResult } from './auth/LoginScreen.tsx';
import { AfterSignIn, Onboarding } from './auth/FirstSteps.tsx';
import { Shell } from './Shell.tsx';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'onboarding' }
  | { kind: 'locked'; username: string; lockedUntil: string | null }
  | { kind: 'afterSignIn'; username: string; result: LoginResult }
  | { kind: 'unlocked'; username: string };

function phaseFrom(status: AuthStatus): Phase {
  switch (status.state) {
    case 'onboarding': return { kind: 'onboarding' };
    case 'locked': return { kind: 'locked', username: status.username, lockedUntil: status.lockedUntil };
    case 'mustChangePassword': return { kind: 'afterSignIn', username: status.username, result: { mustChangePassword: true } };
    case 'unlocked': return { kind: 'unlocked', username: status.username };
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [settings, setSettings] = useState<SettingsView | null>(null);
  // Once signed in, the shell stays mounted under the lock screen so locking keeps your place
  const [shellMounted, setShellMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const osReduced = useOsReducedMotion();
  const decor = !reduceMotion && !osReduced;
  const decorRef = useRef(decor);
  useEffect(() => {
    decorRef.current = decor;
  });

  // Decorative loops pause while the window is hidden or minimized
  useEffect(() => {
    const sync = () => { document.documentElement.dataset.hidden = String(document.hidden); };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // Theme changes crossfade night ↔ dawn; everything else applies at once
  const applyLook = useCallback((appearance: Appearance) => {
    configureSound(appearance);
    const themeChanged = document.documentElement.dataset.theme !== appearance.theme;
    setReduceMotion(appearance.reduceMotion);
    if (themeChanged) crossfadeTheme(() => applyAppearance(appearance), decorRef.current && !appearance.reduceMotion);
    else applyAppearance(appearance);
  }, []);

  // Bumping `boot` re-reads appearance and auth status (after setup, or to retry an error)
  const [boot, setBoot] = useState(0);
  const restart = useCallback(() => {
    setPhase({ kind: 'loading' });
    setBoot((b) => b + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const appearance = await call('settings:getAppearance');
        const status = await call('auth:status');
        if (cancelled) return;
        applyAppearance(appearance);
        configureSound(appearance);
        setReduceMotion(appearance.reduceMotion);
        setPhase(phaseFrom(status));
      } catch (err) {
        if (!cancelled) setPhase({ kind: 'error', message: errorText(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [boot]);

  // Settings load after sign-in (they are not readable while locked)
  useEffect(() => {
    if (phase.kind !== 'unlocked') return;
    let cancelled = false;
    call('settings:get').then((view) => {
      if (cancelled) return;
      setSettings(view);
      applyLook(view.settings.appearance);
      setShellMounted(true);
    }).catch((err) => { if (!cancelled) setPhase({ kind: 'error', message: errorText(err) }); });
    return () => { cancelled = true; };
  }, [phase.kind, applyLook]);

  const settingsApi: SettingsApi = useMemo(() => {
    const accept = (view: SettingsView) => {
      setSettings(view);
      applyLook(view.settings.appearance);
      return view;
    };
    return {
      view: settings,
      update: (section, values) => call('settings:update', { section, values }).then(accept),
      setSecret: (name, value) => call('settings:setSecret', { name, value }).then(accept),
    };
  }, [settings, applyLook]);

  const lock = useCallback(async () => {
    await call('auth:lock').catch(() => {});
    const status = await call('auth:status').catch(() => null);
    setPhase(status ? phaseFrom(status) : { kind: 'locked', username: '', lockedUntil: null });
  }, []);

  const onSignedIn = (username: string) => (result: LoginResult) => {
    if (result.mustChangePassword) setPhase({ kind: 'afterSignIn', username, result });
    else {
      playSound('unlock');
      setPhase({ kind: 'unlocked', username });
    }
  };

  const username = 'username' in phase ? phase.username : '';
  const overlay = (() => {
    switch (phase.kind) {
      case 'loading':
        return <div className="flex h-full items-center justify-center"><BrandMark size={64} className="animate-pulse" /></div>;
      case 'error':
        return <ErrorState message={phase.message} onRetry={restart} className="h-full" />;
      case 'onboarding':
        return <Onboarding onDone={restart} />;
      case 'locked':
        return <LoginScreen knownUsername={phase.username} lockedUntil={phase.lockedUntil} locked={shellMounted} onSignedIn={onSignedIn(phase.username)} />;
      case 'afterSignIn':
        return <AfterSignIn onDone={() => { playSound('unlock'); setPhase({ kind: 'unlocked', username: phase.username }); }} />;
      case 'unlocked':
        return null;
    }
  })();

  return (
    <DecorContext.Provider value={decor}>
      <MotionConfig reducedMotion={decor ? 'never' : 'always'}>
        <TooltipProvider>
          <ToastProvider>
            <SettingsContext.Provider value={settingsApi}>
              {shellMounted && settings && (
                <Shell username={username} locked={phase.kind !== 'unlocked'} onLock={() => void lock()} />
              )}
              {/* Unlocking swings the signed-out screen open into the app */}
              <AnimatePresence>
                {overlay && (
                  <motion.div
                    key="overlay"
                    className="fixed inset-0 z-[90] bg-bg [perspective:1600px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.55, delay: 0.25 } }}
                    transition={{ duration: 0.25 }}
                  >
                    <motion.div
                      className="h-full origin-left"
                      exit={{ rotateY: -78, opacity: 0, transition: { duration: 0.7, ease: [0.55, 0, 0.3, 1] } }}
                    >
                      {overlay}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </SettingsContext.Provider>
          </ToastProvider>
        </TooltipProvider>
      </MotionConfig>
    </DecorContext.Provider>
  );
}
