// Text for the timeline. Fixed en-GB and UTC so the server and the browser print the same thing.
import type { HistoryRecord } from './types';
import { dateFormatter } from '../lists/dates';

const dateFmt = dateFormatter({ day: 'numeric', month: 'short', year: 'numeric' });
/** "25 Nov 2026" from YYYY-MM-DD or a full timestamp; "Date not known" when empty. */
export const fmtDate = (v: string | null | undefined) => (v ? dateFmt.format(new Date(v.length === 10 ? `${v}T00:00:00Z` : v)) : 'Date not known');

const SIGNALS: Record<string, string> = {
  tracking_link: 'a tracking link in the description',
  hashtag_ad: 'an ad hashtag',
  thanks_sponsor: 'a thank-you to the sponsor',
  paid_partnership: 'the paid-partnership label',
  imported_unverified: 'imported from a file and not checked',
  discount_code: 'a discount code',
  paid_flag: 'the paid-promotion flag',
};
const ORIGINS: Record<string, string> = {
  manual: 'entered by the team',
  import: 'imported from a file',
  deal: 'a Smallfold deal',
  detected: 'detected, then checked by the team',
};

/** The "where it came from" sentence under a record. */
export function sourceSentence(r: HistoryRecord): string {
  if (r.label === 'confirmed') {
    const by = r.confirmedByName ? ` by ${r.confirmedByName}` : '';
    const note = r.evidenceNote ? ` ${r.evidenceNote.trim().replace(/[.!?]?$/, '.')}` : '';
    return `Confirmed${by} on ${fmtDate(r.confirmedAt)}. Source: ${ORIGINS[r.origin] ?? r.origin}.${note}`;
  }
  const signal = r.detectionSignal ? (SIGNALS[r.detectionSignal] ?? r.detectionSignal.replace(/_/g, ' ')) : 'a sign of a paid promotion';
  return `Found automatically on ${fmtDate(r.createdAt)}: ${signal}. Confidence: ${r.detectionConfidence ?? 'not known'}. Nobody has checked it.`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
