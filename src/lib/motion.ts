import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Decorative motion is on unless Reduce motion is set in Arcana or in Windows.
// Functional changes still happen, just instantly.
export const DecorContext = createContext(true);

export function useDecor(): boolean {
  return useContext(DecorContext);
}

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduce(onChange: () => void) {
  const media = window.matchMedia(REDUCE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useOsReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE_QUERY).matches, () => false);
}

// Counts from the previous value to the new one (ease-out); instant when decoration is off
export function useCountUp(value: number, duration = 900): number {
  const decor = useDecor();
  const [shown, setShown] = useState(decor ? 0 : value);
  const from = useRef(decor ? 0 : value);

  useEffect(() => {
    if (!decor) {
      from.current = value;
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, decor]);

  return shown;
}

// Applies a theme change as a slow crossfade (night ↔ dawn) when decoration is on
export function crossfadeTheme(apply: () => void, decor: boolean) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (decor && doc.startViewTransition) doc.startViewTransition(apply);
  else apply();
}
