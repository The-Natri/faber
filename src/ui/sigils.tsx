import type { SVGProps } from 'react';

// Original line sigils for the brand mark and empty states. Generic workshop and
// astronomical imagery only (compass rose, anvil, quill, seal).

type SigilProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 64 64', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export function CompassRose({ size = 64, ...rest }: SigilProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="32" cy="32" r="26" />
      <circle cx="32" cy="32" r="21" strokeDasharray="1.5 3.5" />
      <path d="M32 6 L36 28 L32 32 L28 28 Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M32 58 L28 36 L32 32 L36 36 Z" />
      <path d="M6 32 L28 28 L32 32 L28 36 Z" />
      <path d="M58 32 L36 36 L32 32 L36 28 Z" />
      <path d="M17 17 L30 30 M47 47 L34 34 M47 17 L34 30 M17 47 L30 34" strokeOpacity="0.55" />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
    </svg>
  );
}

export function Anvil({ size = 64, ...rest }: SigilProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M10 22 H44 C50 22 56 20 58 16 C58 24 52 30 44 30 H38 V36 H26 V30 H18 C13 30 10 26 10 22 Z" />
      <path d="M26 36 L22 46 H42 L38 36" />
      <path d="M16 46 H48 V52 H16 Z" />
      <path d="M30 10 L33 4 M36 12 L41 7 M24 12 L20 7" strokeOpacity="0.6" />
    </svg>
  );
}

export function Quill({ size = 64, ...rest }: SigilProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M52 6 C34 10 20 24 16 44 L20 48 C40 44 54 30 58 12 Z" />
      <path d="M52 6 L18 46" strokeOpacity="0.6" />
      <path d="M30 26 L40 26 M24 34 L34 34 M20 40 L28 40" strokeOpacity="0.5" />
      <path d="M16 44 L8 58" />
      <path d="M6 58 H22" strokeOpacity="0.6" />
    </svg>
  );
}

export function WaxSeal({ size = 64, ...rest }: SigilProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M32 6 C38 8 42 6 46 10 C50 14 54 16 54 22 C58 26 58 32 56 36 C58 42 54 46 50 50 C48 56 42 56 38 58 C34 60 28 60 24 58 C18 58 14 54 12 50 C8 46 6 42 8 36 C6 30 6 26 10 22 C10 16 14 14 18 10 C22 6 26 6 32 6 Z" />
      <circle cx="32" cy="32" r="16" />
      <path d="M24 38 L32 22 L40 38 M27 32 H37" />
    </svg>
  );
}

