import type { Currency } from './types';

/** "$1,234" / "A$1,851". Whole numbers from 10 up are rounded unless `dec` is true. Cents show only when needed. */
export function formatMoney(value: number, currency: Currency = 'USD', rate = 1, dec = false): string {
  const x = value * (currency === 'AUD' ? rate : 1);
  const whole = !dec && (x >= 10 || x === 0);
  const text = whole
    ? Math.round(x).toLocaleString('en-US')
    : x.toLocaleString('en-US', { minimumFractionDigits: !dec && Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 });
  return (currency === 'AUD' ? 'A$' : '$') + text;
}

export const formatCount = (n: number) => Number(n).toLocaleString('en-US');

export function shortCount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return String(n);
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Rounds an asking price to a tidy figure: steps of 5, 10, 50, 100 or 500 by size. */
export function tidy(v: number): number {
  const st = v < 100 ? 5 : v < 500 ? 10 : v < 2000 ? 50 : v < 10000 ? 100 : 500;
  return Math.round(v / st) * st;
}

/** "1.5k", "20,000" or "20000" to a whole number; null when it is not a number. */
export function parseCount(s: string): number | null {
  const m = /^\s*\$?\s*([\d.,]+)\s*([kKmM]?)\s*$/.exec(String(s));
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(v)) return null;
  if (/k/i.test(m[2])) v *= 1e3;
  if (/m/i.test(m[2])) v *= 1e6;
  return Math.round(v);
}

/** A loose decimal ("8", "8%", "$6.5"); null when empty or not a number. */
export function parseDecimal(s: string): number | null {
  const x = parseFloat(String(s).replace(/[$,%\s]/g, ''));
  return isNaN(x) ? null : x;
}
