import type { CpmGroupId, ExtraId, FormatId } from './types';

/** id, name, low CPM, high CPM, open-ended marker */
export const CPM_GROUPS: { id: CpmGroupId; name: string; lo: number; hi: number; open?: string }[] = [
  { id: 'gaming', name: 'Gaming / entertainment', lo: 6, hi: 15 },
  { id: 'life', name: 'Lifestyle / general', lo: 15, hi: 30 },
  { id: 'tech', name: 'Tech', lo: 20, hi: 40 },
  { id: 'finance', name: 'Finance / business', lo: 30, hi: 50, open: '+' },
  { id: 'b2b', name: 'B2B software', lo: 40, hi: 80 },
];

export const FORMATS: { id: FormatId; name: string; low: number; mid: number; high: number }[] = [
  { id: 'int', name: '60-second integration', low: 1, mid: 1, high: 1 },
  { id: 'ded', name: 'Dedicated video', low: 2, mid: 2.5, high: 3 },
  { id: 'short', name: 'Short', low: 0.3, mid: 0.4, high: 0.5 },
  { id: 'pre', name: 'Pre-roll or brief mention', low: 0.3, mid: 0.4, high: 0.5 },
];

export const EXTRAS: { id: ExtraId; name: string }[] = [
  { id: 'link', name: 'Link in the description' },
  { id: 'pin', name: 'Pinned comment' },
  { id: 'post', name: 'Community post' },
];

/** Creator niche slug (the fixed niche list) to the default CPM group. */
export function cpmGroupForNiche(slug: string | null | undefined): CpmGroupId {
  if (slug === 'gaming' || slug === 'music') return 'gaming';
  if (slug === 'tech') return 'tech';
  if (slug === 'finance') return 'finance';
  return 'life';
}
