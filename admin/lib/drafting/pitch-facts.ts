// Turns database rows into the facts Claude may see in pitch mode, plus the two lists the screen shows.
// Pure functions, so the tests can prove what is and is not included.
import type { PitchFacts, PitchInput, PitchLists } from './pitch-types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-14" -> "Mar 2026". Empty for a missing or odd date. */
export function monthYear(d: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(d ?? '');
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const first = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const fmt = (n: number) => n.toLocaleString('en-US');
export function short(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function buildPitchFacts(input: PitchInput): { facts: PitchFacts; lists: PitchLists } {
  const { creator, sponsor } = input;
  const nicheName = (input.creator.niche_slug && input.nicheNames[input.creator.niche_slug]) || creator.niche || null;

  // Past sponsors: confirmed records only, newest first, one per sponsor, never the sponsor being pitched.
  const seen = new Set<string>();
  const past: { name: string; month: string }[] = [];
  const rows = [...input.confirmed].sort((a, b) => (b.sponsored_on ?? '').localeCompare(a.sponsored_on ?? ''));
  for (const r of rows) {
    const name = (r.brand_name ?? '').trim();
    if (!name || r.brand_id === sponsor.id || sameName(name, sponsor.name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const month = monthYear(r.sponsored_on);
    if (!month) continue; // a sponsorship with no date cannot be stated as a fact
    seen.add(key);
    past.push({ name, month });
    if (past.length === 3) break;
  }

  const targetNiches = (sponsor.target_niches ?? []).map((s) => input.nicheNames[s]).filter((n): n is string => !!n);
  const facts: PitchFacts = {
    direction: input.direction,
    creator: {
      firstName: first(creator.full_name),
      channelName: creator.channel_name,
      channelUrl: creator.channel_url,
      niche: nicheName,
      subscribers: creator.subscribers_hidden ? null : creator.subscribers,
      avgViews: creator.avg_views ?? null,
    },
    sponsor: {
      name: sponsor.name,
      industry: sponsor.industry,
      targetNiches,
      targetMinSubs: sponsor.target_min_subs,
      targetMaxSubs: sponsor.target_max_subs,
    },
    pastSponsors: past,
    similarChannels: Math.max(0, input.similarChannels | 0),
    contactFirstName: input.direction === 'to_sponsor' ? first(input.contactName) || null : null,
  };

  // The two lists for the screen.
  const used: string[] = [];
  const f = facts.creator;
  if (f.subscribers !== null) used.push(`Subscribers: ${fmt(f.subscribers)}`);
  if (f.avgViews !== null) used.push(`Average views: ${fmt(f.avgViews)}`);
  if (f.niche) used.push(`Niche: ${f.niche}`);
  if (f.channelName) used.push(`Channel: ${f.channelName}`);
  if (facts.sponsor.industry) used.push(`Sponsor's industry: ${facts.sponsor.industry}`);
  if (targetNiches.length) used.push(`Niches the sponsor targets: ${targetNiches.join(', ')}`);
  const { targetMinSubs: lo, targetMaxSubs: hi } = facts.sponsor;
  if (lo !== null || hi !== null) {
    used.push(`Sponsor's target size: ${lo !== null && hi !== null ? `${short(lo)} to ${short(hi)}` : lo !== null ? `${short(lo)} and above` : `up to ${short(hi as number)}`} subscribers`);
  }
  for (const p of past) used.push(`Confirmed sponsorship: ${p.name}, ${p.month}`);
  if (facts.similarChannels > 0 && f.niche) {
    used.push(`${sponsor.name} has confirmed sponsorships with ${facts.similarChannels} other ${f.niche.toLowerCase()} ${facts.similarChannels === 1 ? 'channel' : 'channels'}`);
  }
  if (facts.contactFirstName) used.push(`Contact's first name: ${facts.contactFirstName}`);

  const leftOut: string[] = [];
  for (const d of input.detected) {
    if (d.rejected) continue; // a rejected record is gone for good: not even listed
    const m = monthYear(d.sponsored_on);
    leftOut.push(`Detected sponsorship: ${d.brand_name?.trim() || 'sponsor not named'}${m ? `, ${m}` : ''} (not confirmed)`);
  }
  leftOut.push(
    'Prices, budgets and commission (never in a first email)',
    input.direction === 'to_creator' ? "The creator's email, phone and notes (Claude never receives them)" : "The contact person's email and phone, and the creator's email, phone and notes (Claude never receives them)",
  );
  return { facts, lists: { used, leftOut } };
}
