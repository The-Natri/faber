import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/format.ts';
import { useDecor } from '../lib/motion.ts';

// Original ornaments and animated pieces for the Arcane Workshop look. All decoration is
// aria-hidden, animates only transform/opacity, and disappears under Reduce motion (.decor).

// Small deterministic pseudo-random, so ornaments look the same on every render
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ── Candle ────────────────────────────────────────────────────────────────

export function Candle({ height = 70, className }: { height?: number; className?: string }) {
  const width = height * 0.42;
  return (
    <svg width={width} height={height} viewBox="0 0 30 72" className={className} aria-hidden>
      <defs>
        <radialGradient id="candle-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD58A" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFD58A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="candle-wax" x1="0" x2="1">
          <stop offset="0%" stopColor="#E9DCC0" />
          <stop offset="60%" stopColor="#F7EEDB" />
          <stop offset="100%" stopColor="#CDBB98" />
        </linearGradient>
      </defs>
      <circle className="decor" cx="15" cy="13" r="14" fill="url(#candle-halo)" style={{ animation: 'halo 3.4s ease-in-out infinite' }} />
      <g style={{ transformOrigin: '15px 22px', animation: 'flicker 2.6s ease-in-out infinite' }}>
        <path d="M15 4 C19 11 19 17 15 22 C11 17 11 11 15 4 Z" fill="#FFC864" />
        <path d="M15 11 C17 15 17 18 15 21 C13 18 13 15 15 11 Z" fill="#FFF3D1" />
      </g>
      <line x1="15" y1="21" x2="15" y2="25" stroke="#3A2A1A" strokeWidth="1" />
      <path d="M8 25 H22 V64 H8 Z" fill="url(#candle-wax)" />
      <path d="M8 25 C10 28 12 27 13 30 C13 33 15 33 15 30 C16 27 20 28 22 25" fill="#F7EEDB" />
      <path d="M3 64 H27 L25 70 H5 Z" fill="#8A6A3A" />
    </svg>
  );
}

// ── Ambience: star drift and dust motes (login + Atrium only) ─────────────

export function StarDrift({ className }: { className?: string }) {
  return (
    <div className={cn('decor pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div
        className="absolute -inset-[160px]"
        style={{
          backgroundImage:
            'radial-gradient(1.2px 1.2px at 20% 30%, rgba(255,240,210,.55), transparent 60%),' +
            'radial-gradient(1px 1px at 70% 60%, rgba(255,240,210,.4), transparent 60%),' +
            'radial-gradient(1.4px 1.4px at 40% 80%, rgba(255,230,190,.45), transparent 60%),' +
            'radial-gradient(1px 1px at 85% 15%, rgba(255,240,210,.35), transparent 60%),' +
            'radial-gradient(1.1px 1.1px at 55% 45%, rgba(255,240,210,.3), transparent 60%)',
          backgroundSize: '260px 220px',
          animation: 'drift 140s linear infinite alternate',
          willChange: 'transform',
        }}
      />
    </div>
  );
}

export function DustMotes({ count = 14, className }: { count?: number; className?: string }) {
  const motes = useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      left: `${rand() * 100}%`,
      top: `${40 + rand() * 60}%`,
      size: 1.5 + rand() * 2.5,
      duration: 9 + rand() * 10,
      delay: -rand() * 18,
      mx: `${(rand() - 0.5) * 80}px`,
      my: `${-60 - rand() * 120}px`,
    }));
  }, [count]);
  return (
    <div className={cn('decor pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {motes.map((m) => (
        <span
          key={m.key}
          className="absolute rounded-full"
          style={{
            left: m.left, top: m.top, width: m.size, height: m.size,
            background: 'rgba(255, 215, 150, 0.55)',
            animation: `mote ${m.duration}s ease-in-out ${m.delay}s infinite`,
            ['--mx' as string]: m.mx, ['--my' as string]: m.my,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Rune strip (decorative band; glyphs are generic, never text) ──────────

const RUNES = "M2 2v8M2 4l3-2M2 6l3-2 M9 2v8M9 2l3 4l-3 4 M16 2v8M19 2v8M16 6h3 M24 2l3 4l-3 4M27 2v8 M33 2v8M33 2l3 3M33 5l3 3 M41 2l3 8M44 2l-3 8 M49 2v8M49 6l3-2v6 M57 2v8M57 2l3 2l-3 2 M65 2l2 8l2-8 M73 2v8M73 4h3M73 8h3";

export function RuneStrip({ className, opacity = 0.55 }: { className?: string; opacity?: number }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='82' height='12'><path d='${RUNES}' stroke='black' stroke-width='1.1' fill='none' stroke-linecap='round'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return (
    <div
      aria-hidden
      className={cn('h-3 w-full', className)}
      style={{
        backgroundColor: 'var(--gilt-b)',
        opacity,
        WebkitMaskImage: url, maskImage: url,
        WebkitMaskRepeat: 'repeat-x', maskRepeat: 'repeat-x',
        WebkitMaskSize: '82px 12px', maskSize: '82px 12px',
      }}
    />
  );
}

// ── Hourglass of gold sand ────────────────────────────────────────────────

export function Hourglass({ fraction, size = 96, className }: { fraction: number; size?: number; className?: string }) {
  const decor = useDecor();
  const f = Math.max(0, Math.min(1, fraction));
  const running = decor && f < 1;
  return (
    <svg width={size * 0.62} height={size} viewBox="0 0 62 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="sand" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F6D58A" />
          <stop offset="100%" stopColor="#C9933F" />
        </linearGradient>
        <clipPath id="hg-top"><path d="M12 10 H50 C50 30 36 40 32 48 C28 40 12 30 12 10 Z" /></clipPath>
        <clipPath id="hg-bottom"><path d="M12 90 H50 C50 70 36 60 32 52 C28 60 12 70 12 90 Z" /></clipPath>
      </defs>
      {/* Remaining sand on top drains; the bottom fills with the goal's progress */}
      <g clipPath="url(#hg-top)">
        <motion.rect x="10" y="10" width="42" height="40" fill="url(#sand)" style={{ originY: 1, originX: 0.5 }}
          initial={{ scaleY: decor ? 1 : 1 - f }} animate={{ scaleY: 1 - f }} transition={{ duration: 1.4, ease: 'easeOut' }} />
      </g>
      <g clipPath="url(#hg-bottom)">
        <motion.rect x="10" y="50" width="42" height="40" fill="url(#sand)" style={{ originY: 1, originX: 0.5 }}
          initial={{ scaleY: decor ? 0 : f }} animate={{ scaleY: f }} transition={{ duration: 1.4, ease: 'easeOut' }} />
      </g>
      {running && (
        <g className="decor">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx="32" cy="50" r="0.9" fill="#F6D58A"
              style={{ animation: `grain 0.9s linear ${i * 0.3}s infinite` }} />
          ))}
        </g>
      )}
      <path d="M12 10 H50 C50 30 36 40 32 50 C36 60 50 70 50 90 H12 C12 70 28 60 32 50 C28 40 12 30 12 10 Z"
        fill="rgba(200,230,255,0.06)" stroke="var(--gilt-b)" strokeWidth="1.4" />
      <rect x="6" y="4" width="50" height="6" rx="2" fill="var(--gilt-a)" />
      <rect x="6" y="90" width="50" height="6" rx="2" fill="var(--gilt-a)" />
      <style>{'@keyframes grain{from{transform:translateY(0);opacity:1}to{transform:translateY(34px);opacity:.2}}'}</style>
    </svg>
  );
}

// ── Crystal sphere (Scrying) ──────────────────────────────────────────────

export function CrystalSphere({ size = 300, active, children }: { size?: number; active: boolean; children?: ReactNode }) {
  const decor = useDecor();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Rotating rune ring */}
      <svg className="decor absolute inset-0" viewBox="0 0 200 200" aria-hidden
        style={{ animation: `spin ${active ? 40 : 120}s linear infinite`, willChange: 'transform' }}>
        <circle cx="100" cy="100" r="97" fill="none" stroke="var(--gilt-a)" strokeWidth="0.8" opacity="0.6" />
        <circle cx="100" cy="100" r="90" fill="none" stroke="var(--gilt-b)" strokeWidth="0.6" strokeDasharray="2 5" opacity="0.7" />
        {Array.from({ length: 24 }, (_, i) => (
          <path key={i} d="M100 4 l0 5 M98 6 l4 0" stroke="var(--gilt-b)" strokeWidth="0.8" opacity="0.7" transform={`rotate(${i * 15} 100 100)`} />
        ))}
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{ inset: size * 0.07, boxShadow: '0 0 0 1.5px var(--gilt-a), 0 0 40px rgba(120,170,230,0.25), inset 0 0 30px rgba(0,0,0,0.6)' }}
      >
        {children}
        {/* Swirl while a search runs */}
        <motion.div
          className="decor pointer-events-none absolute -inset-1/4"
          style={{ background: 'conic-gradient(from 0deg, transparent, rgba(140,200,255,0.18), transparent 30%, rgba(240,194,122,0.16), transparent 60%, rgba(140,200,255,0.14), transparent)' }}
          animate={decor && active ? { rotate: 360, opacity: 1 } : { rotate: 0, opacity: 0 }}
          transition={decor && active ? { rotate: { duration: 6, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.6 } } : { duration: 0.6 }}
        />
        {/* Glass highlight */}
        <div className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(60% 40% at 32% 22%, rgba(255,255,255,0.22), transparent 70%), radial-gradient(90% 90% at 50% 50%, transparent 62%, rgba(10,20,40,0.55))' }} />
      </div>
    </div>
  );
}

// ── Balance scales (Treasury: received vs outstanding) ───────────────────

export function BalanceScales({ received, outstanding, size = 180 }: { received: number; outstanding: number; size?: number }) {
  const total = received + outstanding;
  // Tips toward the heavier pan, at most 14°; level when nothing is agreed
  const tilt = total > 0 ? ((outstanding - received) / total) * 14 : 0;
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 200 156" aria-hidden>
      <path d="M100 30 V136 M70 146 H130 M80 136 H120" stroke="var(--gilt-a)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="26" r="6" fill="var(--gilt-b)" />
      <motion.g style={{ originX: '100px', originY: '30px' }} animate={{ rotate: tilt }} transition={{ type: 'spring', stiffness: 60, damping: 11 }}>
        <rect x="24" y="27" width="152" height="5" rx="2.5" fill="var(--gilt-b)" />
        {/* Left pan: received (gold coins) */}
        <motion.g animate={{ rotate: -tilt }} style={{ originX: '30px', originY: '30px' }} transition={{ type: 'spring', stiffness: 60, damping: 11 }}>
          <path d="M30 30 L12 80 M30 30 L48 80" stroke="var(--gilt-a)" strokeWidth="1.2" />
          <path d="M8 80 H52 C50 92 10 92 8 80 Z" fill="var(--gilt-a)" />
          {received > 0 && <ellipse cx="30" cy="77" rx="13" ry="4" fill="#F6D58A" />}
        </motion.g>
        {/* Right pan: outstanding */}
        <motion.g animate={{ rotate: -tilt }} style={{ originX: '170px', originY: '30px' }} transition={{ type: 'spring', stiffness: 60, damping: 11 }}>
          <path d="M170 30 L152 80 M170 30 L188 80" stroke="var(--gilt-a)" strokeWidth="1.2" />
          <path d="M148 80 H192 C190 92 150 92 148 80 Z" fill="var(--gilt-a)" />
          {outstanding > 0 && <ellipse cx="170" cy="77" rx="13" ry="4" fill="var(--ink-muted)" opacity="0.7" />}
        </motion.g>
      </motion.g>
    </svg>
  );
}

// ── Ink vial (Backups): fills with swirling ink, then corks ──────────────

export function Vial({ state, size = 64 }: { state: 'idle' | 'filling' | 'done'; size?: number }) {
  const decor = useDecor();
  const level = state === 'idle' ? 0.25 : 0.82;
  return (
    <svg width={size * 0.66} height={size} viewBox="0 0 44 66" aria-hidden>
      <defs>
        <clipPath id="vial-body"><path d="M17 14 H27 V24 C36 28 40 36 40 46 C40 57 32 63 22 63 C12 63 4 57 4 46 C4 36 8 28 17 24 Z" /></clipPath>
        <linearGradient id="vial-ink" x1="0" x2="1">
          <stop offset="0%" stopColor="#1C3B6E" />
          <stop offset="100%" stopColor="#3A6FB5" />
        </linearGradient>
      </defs>
      <g clipPath="url(#vial-body)">
        <motion.rect x="0" y="14" width="44" height="50" fill="url(#vial-ink)" style={{ originY: 1 }}
          initial={false} animate={{ scaleY: level }} transition={{ duration: decor ? 1.4 : 0, ease: 'easeInOut' }} />
        {state === 'filling' && decor && (
          <g style={{ transformOrigin: '22px 46px', animation: 'spin 1.6s linear infinite' }}>
            <path d="M10 46 C16 40 28 52 34 46" stroke="rgba(200,225,255,0.55)" strokeWidth="1.6" fill="none" />
          </g>
        )}
      </g>
      <path d="M17 14 H27 V24 C36 28 40 36 40 46 C40 57 32 63 22 63 C12 63 4 57 4 46 C4 36 8 28 17 24 Z"
        fill="rgba(200,230,255,0.08)" stroke="var(--gilt-b)" strokeWidth="1.3" />
      <path d="M12 34 C10 40 10 46 12 52" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <motion.rect x="16" width="12" height="9" rx="2" fill="#8A5E33"
        initial={false} animate={{ y: state === 'done' || state === 'idle' ? 6 : -10, opacity: state === 'filling' ? 0.4 : 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14 }} />
    </svg>
  );
}

// ── Writing quill (enrichment chip) ───────────────────────────────────────

export function WritingQuill({ writing, raised, size = 16 }: { writing: boolean; raised?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        style={{
          transformOrigin: '20% 85%',
          animation: writing && !raised ? 'quill-write 0.9s ease-in-out infinite' : undefined,
          transform: raised ? 'rotate(-28deg) translateY(-2px)' : undefined,
          transition: 'transform 300ms ease',
        }}>
        <path d="M20 3 C12 4 7 10 5 19 L6 20 C14 18 20 12 21 4 Z" />
        <path d="M20 3 L6 19" />
        <path d="M5 19 L3 22" />
      </svg>
      {writing && !raised && (
        <span className="decor absolute -bottom-0.5 left-0 h-1 w-1 rounded-full bg-current" style={{ animation: 'ink-dot 0.9s ease-out infinite' }} />
      )}
    </span>
  );
}

// ── Wax seal (score seal, setup scroll, factory reset) ───────────────────

export function WaxSealShape({ color, size = 44, cracks = 0, children, className }: {
  color: string; size?: number; cracks?: number; children?: ReactNode; className?: string;
}) {
  return (
    <span className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg className="absolute inset-0" viewBox="0 0 48 48" aria-hidden>
        <path d="M24 2 C30 3 33 2 37 6 C41 9 45 11 45 17 C47 21 47 27 45 31 C46 37 41 40 38 43 C34 46 29 46 25 47 C20 47 15 46 11 43 C6 41 3 37 3 31 C1 27 1 22 3 17 C3 11 7 8 11 6 C15 3 19 2 24 2 Z"
          fill={color} />
        <circle cx="24" cy="24.5" r="15" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="1.2" />
        <circle cx="24" cy="24.5" r="15" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" transform="translate(-0.6 -0.6)" />
        <path d="M12 12 C16 8 22 7 27 8" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* Cracks appear in stages */}
        <path d="M24 3 L22 14 L27 20 L23 28" stroke="rgba(10,5,2,0.75)" strokeWidth="1.2" fill="none" style={{ opacity: cracks >= 1 ? 1 : 0, transition: 'opacity 250ms' }} />
        <path d="M45 22 L33 24 L28 31 L32 40" stroke="rgba(10,5,2,0.75)" strokeWidth="1.2" fill="none" style={{ opacity: cracks >= 2 ? 1 : 0, transition: 'opacity 250ms' }} />
        <path d="M5 30 L15 28 L20 35 L16 45" stroke="rgba(10,5,2,0.75)" strokeWidth="1.2" fill="none" style={{ opacity: cracks >= 3 ? 1 : 0, transition: 'opacity 250ms' }} />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

// ── Ink blot, spark burst, smoke ──────────────────────────────────────────

export function InkBlot({ className, size = 120 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={cn('decor pointer-events-none', className)} aria-hidden
      style={{ animation: 'blot 520ms cubic-bezier(0.2,0.8,0.3,1) both' }}>
      <path d="M50 14 C62 12 66 26 76 24 C88 22 90 38 82 46 C92 54 86 70 74 68 C70 82 54 88 46 78 C36 90 18 82 22 68 C8 66 8 48 20 44 C12 32 24 18 36 24 C40 16 44 15 50 14 Z" fill="rgba(20,12,6,0.82)" />
      <circle cx="88" cy="22" r="3.5" fill="rgba(20,12,6,0.7)" />
      <circle cx="12" cy="82" r="2.5" fill="rgba(20,12,6,0.7)" />
      <circle cx="80" cy="86" r="2" fill="rgba(20,12,6,0.7)" />
    </svg>
  );
}

// Remount (change `burstKey`) to fire again
export function SparkBurst({ burstKey, className }: { burstKey: number; className?: string }) {
  const decor = useDecor();
  if (!decor || burstKey === 0) return null;
  return (
    <span key={burstKey} className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', className)} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 26 + (i % 3) * 10;
        return (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full"
            style={{ background: i % 2 ? '#FFD27A' : 'var(--ember)' }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}

export function Smoke({ className }: { className?: string }) {
  return (
    <span className={cn('decor pointer-events-none absolute inset-0 overflow-visible', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute bottom-1 rounded-full"
          style={{
            left: `${18 + i * 30}%`, width: 26, height: 18,
            background: 'radial-gradient(closest-side, rgba(210,90,90,0.38), transparent)',
            animation: `smoke ${4.2 + i}s ease-out ${i * 1.3}s infinite`,
            ['--sx' as string]: `${i % 2 ? -10 : 10}px`,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}

// ── Text that writes itself in (motto) ────────────────────────────────────

export function InkWrite({ text, className, delay = 0.2 }: { text: string; className?: string; delay?: number }) {
  const decor = useDecor();
  if (!decor) return <span className={className}>{text}</span>;
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span key={i} aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: delay + i * 0.045, duration: 0.25 }}>
          {ch}
        </motion.span>
      ))}
    </span>
  );
}
