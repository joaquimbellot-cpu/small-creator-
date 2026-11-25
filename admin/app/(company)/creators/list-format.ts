// Small display helpers of the Creators list. Dates are shown in UTC so the server and the browser print the same text.
import { NICHES } from '@/lib/creators/constants';
import type { ListRow } from '@/lib/creators/constants';
import { dateFormatter } from '@/lib/lists/dates';

const day = dateFormatter({ dateStyle: 'medium' });
export const fmtDay = (iso: string | null) => (iso ? day.format(new Date(iso)) : null);

export const nicheName = (slug: string | null) => (slug && slug in NICHES ? NICHES[slug as keyof typeof NICHES] : null);

/** Two-letter region and language codes as readable names ("GB" -> "United Kingdom"); the code itself when unknown. */
export function regionName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
}
export function languageName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code; } catch { return code; }
}

/** "3 confirmed + 2 detected" and the date of the last one. `withDetected` follows the "Count detected records too" tick. */
export function sponsorshipText(r: ListRow, withDetected: boolean): { main: string; last: string | null; none: boolean } {
  const c = r.sponsorship_count, d = r.detected_sponsorship_count;
  if (c === 0 && d === 0) return { main: 'None found', last: null, none: true };
  const lastIso = withDetected
    ? [r.last_sponsorship_at, r.last_detected_sponsorship_at].filter(Boolean).sort().pop() ?? null
    : r.last_sponsorship_at;
  return {
    main: `${c} confirmed${d ? ` + ${d} detected` : ''}`,
    last: lastIso ? `Last: ${fmtDay(lastIso)}` : 'No confirmed date',
    none: false,
  };
}
