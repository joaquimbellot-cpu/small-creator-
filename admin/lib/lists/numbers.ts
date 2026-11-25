// Number helpers for list filters: "10k" and "1.5M" in, short labels out, and the log scale of the slider.

/** Parse "10k", "1.5M", "12,500" or "$3k" into a whole number. Returns null when it is not a number. */
export function parseShortNumber(input: string | number | null | undefined): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;
  if (input == null) return null;
  const m = /^\s*\$?\s*(\d[\d,]*\.?\d*|\.\d+)\s*([kKmM]?)\s*$/.exec(input);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  if (/k/i.test(m[2])) v *= 1e3;
  else if (/m/i.test(m[2])) v *= 1e6;
  return Math.round(v);
}

/** 950 -> "950", 1500 -> "1.5k", 12500 -> "13k", 1000000 -> "1M", 2500000 -> "2.5M". */
export function formatShort(n: number): string {
  if (!Number.isFinite(n)) return '';
  const a = Math.abs(n);
  const trim = (x: string) => x.replace(/\.0$/, '');
  if (a >= 1e6) return trim((n / 1e6).toFixed(1)) + 'M';
  if (a >= 1e3) return trim((n / 1e3).toFixed(a < 1e4 ? 1 : 0)) + 'k';
  return String(Math.round(n));
}

/** 12500 -> "12,500" (fixed locale so the server and the browser print the same text). */
export function formatFull(n: number): string {
  return Number(n).toLocaleString('en-US');
}

/** Round to two significant digits, so slider values read 12k, not 11,873. */
export function niceNumber(v: number): number {
  if (!(v > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

export type ScaleKind = 'log' | 'linear';
export type SliderScale = {
  /** Slider position 0..100 to a value. Position 100 gives `max`, position 0 gives `min`. */
  toValue: (t: number) => number;
  /** Value to slider position 0..100 (whole number, clamped). */
  toPosition: (v: number) => number;
};

/** Mapping between the slider (0..100) and real values. `log` suits subscribers (1,000 to 1,000,000). */
export function makeScale(min: number, max: number, kind: ScaleKind = 'log'): SliderScale {
  if (kind === 'log') {
    const span = Math.log10(max / min);
    return {
      toValue: (t) => (t >= 100 ? max : t <= 0 ? min : Math.min(max, Math.max(min, niceNumber(min * Math.pow(10, (t / 100) * span))))),
      toPosition: (v) => (v <= min ? 0 : clamp(Math.round((Math.log10(v / min) / span) * 100), 0, 100)),
    };
  }
  return {
    toValue: (t) => (t >= 100 ? max : t <= 0 ? min : Math.min(max, Math.max(min, niceNumber(min + ((max - min) * t) / 100)))),
    toPosition: (v) => clamp(Math.round(((v - min) / (max - min)) * 100), 0, 100),
  };
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** "10000-50000" -> [10000, 50000]; "10000-" -> [10000, null]; "-50000" -> [null, 50000]; bad input -> null. */
export function parseRange(s: string | null | undefined): [number | null, number | null] | null {
  if (!s) return null;
  const m = /^(\d*)-(\d*)$/.exec(s.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  const a = m[1] === '' ? null : Number(m[1]);
  const b = m[2] === '' ? null : Number(m[2]);
  if (a != null && b != null && a > b) return [b, a];
  return [a, b];
}

/** [10000, null] -> "10000-"; [null, null] -> null (so the key is removed from the address). */
export function formatRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  return `${min ?? ''}-${max ?? ''}`;
}

/** "10k to 50k", "100k and above", "up to 5k". */
export function describeRange(min: number | null, max: number | null, fmt: (n: number) => string = formatShort): string {
  if (min != null && max != null) return `${fmt(min)} to ${fmt(max)}`;
  if (min != null) return `${fmt(min)} and above`;
  if (max != null) return `up to ${fmt(max)}`;
  return 'Any';
}
