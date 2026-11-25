// Turns database rows into what the palette shows: a title, one line of public context and a link. Pure, no React.
import type { SearchRow } from './schema';

export type SearchItem = { key: string; kind: 'creator' | 'sponsor' | 'deal' | 'page'; title: string; meta: string; href: string };
export type SearchGroup = { label: string; items: SearchItem[] };

const STAGE: Record<string, string> = {
  matched: 'Matched', contacted: 'Contacted', replied: 'Replied', negotiating: 'Negotiating', signed: 'Signed', completed: 'Completed', paid: 'Paid',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function stageLabel(stage: string | null): string {
  return stage ? STAGE[stage] ?? stage.replace(/_/g, ' ') : '';
}

// 12,500 -> "13k", 1,500 -> "1.5k", 1,200,000 -> "1.2M"; a fixed format so the server and the browser agree.
export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(Math.round(n / 100_000) / 10).toString().replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toString().replace(/\.0$/, '')}k`;
  return String(n);
}

export function toItem(r: SearchRow): SearchItem | null {
  if (!UUID.test(r.id)) return null;
  if (r.kind === 'creator') {
    const parts = [r.channel, r.subscribers == null ? null : `${shortCount(r.subscribers)} subscribers`].filter(Boolean);
    return { key: `creator-${r.id}`, kind: 'creator', title: r.name, meta: parts.join(' · '), href: `/creators/${r.id}` };
  }
  if (r.kind === 'sponsor') return { key: `sponsor-${r.id}`, kind: 'sponsor', title: r.name, meta: r.industry ?? '', href: `/sponsors/${r.id}` };
  if (r.kind === 'deal') return { key: `deal-${r.id}`, kind: 'deal', title: `${r.name} with ${r.other_name ?? 'a sponsor'}`, meta: stageLabel(r.stage), href: '/deals' };
  return null;
}

// Creators, Sponsors, Deals, at most 6 each, empty groups left out.
export function groupResults(rows: SearchRow[]): SearchGroup[] {
  const by = { creator: [] as SearchItem[], sponsor: [] as SearchItem[], deal: [] as SearchItem[] };
  for (const r of rows) {
    const it = toItem(r);
    if (it && it.kind !== 'page' && by[it.kind].length < 6) by[it.kind].push(it);
  }
  return [
    { label: 'Creators', items: by.creator },
    { label: 'Sponsors', items: by.sponsor },
    { label: 'Deals', items: by.deal },
  ].filter((g) => g.items.length > 0);
}

export const GO_TO: SearchItem[] = [
  { key: 'page-creators', kind: 'page', title: 'Creators', meta: 'Page', href: '/creators' },
  { key: 'page-sponsors', kind: 'page', title: 'Sponsors', meta: 'Page', href: '/sponsors' },
  { key: 'page-deals', kind: 'page', title: 'Deals', meta: 'Page', href: '/deals' },
  { key: 'page-calculator', kind: 'page', title: 'Sponsorship price calculator', meta: 'Page', href: '/creators/calculator' },
];

export function flatten(groups: SearchGroup[]): SearchItem[] {
  return groups.flatMap((g) => g.items);
}
