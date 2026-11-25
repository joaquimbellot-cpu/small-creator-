'use server';
// Server actions for the Link dialog and the "For" pickers. Staff only; input is checked with zod; every read and write goes
// through the user's own Supabase client, so row level security applies. A picker never receives an email address, and
// never more than 20 names.
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/staff';
import { NICHES } from '@/lib/creators/constants';
import { optionalAmountSchema } from '@/lib/deals/schemas';
import { STAGE_LABEL, formatUsd, type Stage } from '@/lib/deals/format';
import { formatShort } from '@/lib/lists/numbers';
import { matchForPair, matchesForBrand, matchesForCreator, nameFilter } from '@/lib/matching/load';
import {
  PICKER_LIMIT, linkSchema, nameQuerySchema, pickerQuerySchema, rankMatches, type Match, type PickerOption,
} from '@/lib/matching';
import { cpmGroupForNiche, defaultPriceInput, priceSponsorship } from '@/lib/pricing';
import { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

type CreatorRow = { id: string; full_name: string; channel_name: string | null; niche_slug: string | null; subscribers: number | null; subscribers_hidden: boolean };
type BrandRow = { id: string; name: string; industry: string | null };

const creatorHint = (c: CreatorRow) =>
  [c.channel_name, c.niche_slug && NICHES[c.niche_slug as keyof typeof NICHES], c.subscribers_hidden ? 'subscribers hidden' : c.subscribers != null ? `${formatShort(c.subscribers)} subscribers` : null]
    .filter(Boolean).join(' · ');
const CREATOR_COLS = 'id, full_name, channel_name, niche_slug, subscribers, subscribers_hidden';
const BRAND_COLS = 'id, name, industry';

async function namesFor(db: Db, kind: 'creator' | 'brand', ids: string[]): Promise<Map<string, PickerOption>> {
  const out = new Map<string, PickerOption>();
  if (ids.length === 0) return out;
  if (kind === 'creator') {
    const { data } = await db.from('creators').select(CREATOR_COLS).in('id', ids);
    for (const c of (data ?? []) as CreatorRow[]) out.set(c.id, { id: c.id, name: c.full_name, hint: creatorHint(c) });
  } else {
    const { data } = await db.from('brands').select(BRAND_COLS).in('id', ids);
    for (const b of (data ?? []) as BrandRow[]) out.set(b.id, { id: b.id, name: b.name, hint: b.industry ?? '' });
  }
  return out;
}

export type PickerResult = { ok: true; options: PickerOption[] } | { ok: false; error: string };

/** Up to 20 creators or sponsors by name. With `other` chosen, the best matches for that side come first, each with its score. */
export async function searchPartiesAction(input: unknown): Promise<PickerResult> {
  await requireStaff();
  const p = pickerQuerySchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Check what you typed.' };
  const { kind, q, other } = p.data;
  const db = await createClient();
  try {
    const filter = nameFilter(kind === 'creator' ? ['full_name', 'channel_name'] : ['name'], q);
    if (!other) {
      let query = kind === 'creator'
        ? db.from('creators').select(CREATOR_COLS).order('full_name')
        : db.from('brands').select(BRAND_COLS).order('name');
      if (filter) query = query.or(filter);
      const { data, error } = await query.limit(PICKER_LIMIT);
      if (error) throw error;
      const options = kind === 'creator'
        ? ((data ?? []) as unknown as CreatorRow[]).map((c) => ({ id: c.id, name: c.full_name, hint: creatorHint(c) }))
        : ((data ?? []) as unknown as BrandRow[]).map((b) => ({ id: b.id, name: b.name, hint: b.industry ?? '' }));
      return { ok: true, options };
    }
    // Ranked by score for the other side. When the person typed something, score only the names that match it.
    let ids: string[] | undefined;
    if (filter) {
      const { data, error } = kind === 'creator'
        ? await db.from('creators').select('id').or(filter).limit(200)
        : await db.from('brands').select('id').or(filter).limit(200);
      if (error) throw error;
      ids = (data ?? []).map((r) => r.id as string);
      if (ids.length === 0) return { ok: true, options: [] };
    }
    const matches: Match[] = kind === 'creator' ? await matchesForBrand(db, other, ids) : await matchesForCreator(db, other, ids);
    const top = rankMatches(matches).slice(0, PICKER_LIMIT);
    const names = await namesFor(db, kind, top.map((m) => m.otherId));
    const options = top.flatMap((m) => {
      const n = names.get(m.otherId);
      return n ? [{ ...n, total: m.total, band: m.band, blocked: !!m.blocked }] : [];
    });
    return { ok: true, options };
  } catch (e) {
    console.error('matching: picker search failed', (e as { code?: string })?.code);
    return { ok: false, error: 'The list could not be loaded. Try again.' };
  }
}

/** The name of one creator or sponsor (to show a choice that came from the page address). */
export async function partyNameAction(input: unknown): Promise<{ name: string } | null> {
  await requireStaff();
  const p = nameQuerySchema.safeParse(input);
  if (!p.success) return null;
  const db = await createClient();
  const found = (await namesFor(db, p.data.kind, [p.data.id])).get(p.data.id);
  return found ? { name: found.name } : null;
}

export type PairInfo = {
  creatorName: string;
  brandName: string;
  match: Match | null;
  /** Fair price for a 60-second integration, in whole dollars; null when the creator has no average views. */
  price: { low: number; high: number; ask: number } | null;
  priceNote: string | null;
};
export type PairResult = { ok: true; info: PairInfo } | { ok: false; error: string };

/** Names, score with reasons, blocks and the fair price for one pair (the middle of the Link dialog). */
export async function pairInfoAction(input: unknown): Promise<PairResult> {
  await requireStaff();
  const p = linkSchema.pick({ creatorId: true, brandId: true }).safeParse(input);
  if (!p.success) return { ok: false, error: 'Pick both sides.' };
  const db = await createClient();
  try {
    const [{ data: c }, { data: b }] = await Promise.all([
      db.from('creators').select('full_name, channel_name, niche_slug, subscribers, avg_views, engagement_rate, audience_countries').eq('id', p.data.creatorId).maybeSingle(),
      db.from('brands').select('name, budget_min_cents, budget_max_cents').eq('id', p.data.brandId).maybeSingle(),
    ]);
    if (!c || !b) return { ok: false, error: 'One of them no longer exists. Close this and try again.' };
    const match = await matchForPair(db, p.data.creatorId, p.data.brandId);
    const eng = c.engagement_rate == null ? null : Number(c.engagement_rate);
    const hasBudget = b.budget_min_cents != null && b.budget_max_cents != null;
    const result = priceSponsorship(
      defaultPriceInput({
        name: c.channel_name || c.full_name, niche: cpmGroupForNiche(c.niche_slug), subs: c.subscribers, views: c.avg_views,
        eng: eng != null && Number.isFinite(eng) ? eng : null, aud: c.audience_countries ?? '',
      }),
      { sponsor: hasBudget ? { name: b.name, budgetMinUsd: Number(b.budget_min_cents) / 100, budgetMaxUsd: Number(b.budget_max_cents) / 100 } : null },
    );
    return {
      ok: true,
      info: {
        creatorName: c.full_name, brandName: b.name, match,
        price: result ? { low: Math.round(result.price[0]), high: Math.round(result.price[2]), ask: result.ask } : null,
        priceNote: result ? null : 'Add this creator\'s average views to see a fair price.',
      },
    };
  } catch (e) {
    console.error('matching: pair info failed', (e as { code?: string })?.code);
    return { ok: false, error: 'The score could not be worked out. Try again.' };
  }
}

export type LinkResult = { ok: true; dealId: string; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** "Create link": a deal between the two, at Matched or Contacted. The block rules are checked again here, not only in the dialog. */
export async function createLinkAction(input: unknown): Promise<LinkResult> {
  await requireStaff();
  const p = linkSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the form.' };
  const amount = optionalAmountSchema.safeParse(p.data.amount);
  if (!amount.success) return { ok: false, error: amount.error.issues[0]?.message ?? 'Check the amount.', fieldErrors: { amount: amount.error.issues[0]?.message ?? '' } };

  const db = await createClient();
  let match: Match | null;
  try {
    match = await matchForPair(db, p.data.creatorId, p.data.brandId);
  } catch {
    return { ok: false, error: 'Could not check the pair. Try again.' };
  }
  if (!match) return { ok: false, error: 'One of them no longer exists. Close this and try again.' };
  if (match.blocked) return { ok: false, error: `${match.blocked} This pair cannot be linked.` };
  if (match.openStage) return { ok: false, error: `These two already have an open deal at "${STAGE_LABEL[match.openStage]}".` };

  const { data, error } = await db.from('deals')
    .insert({ creator_id: p.data.creatorId, brand_id: p.data.brandId, stage: p.data.stage, amount_cents: amount.data })
    .select('id').single();
  if (error || !data) {
    console.error('matching: link failed', error?.code);
    return { ok: false, error: 'Could not create the link. Check that both still exist and try again.' };
  }
  revalidatePath('/deals');
  revalidatePath('/overview');
  revalidatePath(`/creators/${p.data.creatorId}`);
  revalidatePath(`/sponsors/${p.data.brandId}`);
  const stage = p.data.stage as Stage;
  return { ok: true, dealId: data.id as string, message: `Linked at "${STAGE_LABEL[stage]}"${amount.data == null ? '.' : ` with an expected ${formatUsd(amount.data)}.`}` };
}
