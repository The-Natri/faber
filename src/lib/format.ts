export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function rupees(amount: number | null | undefined): string {
  return `₹${(amount ?? 0).toLocaleString('en-IN')}`;
}

// AI costs are fractions of a cent, so dollars keep up to six decimals: "$0.000073"
export function usd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.00')}`;
}

export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "2026-10-11" → "Oct 11, 2026" (v1 format)
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// SQLite datetime('now') is UTC without a zone marker
export function parseSqlTime(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = parseSqlTime(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}
