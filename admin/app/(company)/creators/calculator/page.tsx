import type { Metadata } from 'next';
import { z } from 'zod';
import { Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { cpmGroupForNiche, type PriceContext } from '@/lib/pricing';
import { CreatorsSubnav } from '../CreatorsSubnav';
import { PriceCalculator, type Prefill } from './PriceCalculator';

export const metadata: Metadata = { title: 'Sponsorship price calculator' };

// Lenient on version bits: the seed ids are not RFC 4122 versioned.
const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

function one(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : undefined;
}

type CreatorRow = {
  full_name: string; channel_name: string | null; subscribers: number | null; niche_slug: string | null;
  avg_views: number | null; engagement_rate: number | string | null; audience_countries: string | null;
};
type BrandRow = { name: string; budget_min_cents: number | string | null; budget_max_cents: number | string | null };
type DealRow = { amount_cents: number | string | null; creators: { subscribers: number | null } | null };

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const creatorRaw = one(sp.creator);
  const brandRaw = one(sp.brand);
  const creatorId = creatorRaw ? idSchema.safeParse(creatorRaw) : null;
  const brandId = brandRaw ? idSchema.safeParse(brandRaw) : null;
  const notices: string[] = [];

  const supabase = await createClient();
  let prefill: Prefill | null = null;
  let fromName: string | null = null;
  let sponsor: PriceContext['sponsor'] = null;

  if (creatorRaw) {
    if (!creatorId?.success) notices.push('That creator link is not valid, so the form is empty.');
    else {
      const { data, error } = await supabase
        .from('creators')
        .select('full_name, channel_name, subscribers, niche_slug, avg_views, engagement_rate, audience_countries')
        .eq('id', creatorId.data)
        .maybeSingle();
      const c = data as CreatorRow | null;
      if (error || !c) notices.push('That creator was not found, so the form is empty.');
      else {
        const eng = c.engagement_rate == null ? null : Number(c.engagement_rate);
        fromName = c.channel_name || c.full_name;
        prefill = {
          name: fromName, niche: cpmGroupForNiche(c.niche_slug), subs: c.subscribers, views: c.avg_views,
          eng: eng != null && Number.isFinite(eng) ? eng : null, aud: c.audience_countries ?? '',
        };
      }
    }
  }
  if (brandRaw) {
    if (!brandId?.success) notices.push('That sponsor link is not valid, so no sponsor was used.');
    else {
      const { data, error } = await supabase.from('brands').select('name, budget_min_cents, budget_max_cents').eq('id', brandId.data).maybeSingle();
      const b = data as BrandRow | null;
      if (error || !b) notices.push('That sponsor was not found, so no sponsor was used.');
      else if (b.budget_min_cents != null && b.budget_max_cents != null) {
        sponsor = { name: b.name, budgetMinUsd: Number(b.budget_min_cents) / 100, budgetMaxUsd: Number(b.budget_max_cents) / 100 };
      } else notices.push(`${b.name} has no usual budget on file, so there is no budget check.`);
    }
  }

  // The company's own deals, for the check against channels of the same size. RLS applies.
  const { data: deals } = await supabase
    .from('deals')
    .select('amount_cents, creators (subscribers)')
    .not('amount_cents', 'is', null)
    .gt('amount_cents', 0)
    .limit(1000);
  const pastDeals = ((deals ?? []) as unknown as DealRow[])
    .filter((d) => d.creators?.subscribers != null)
    .map((d) => ({ amountUsd: Number(d.amount_cents) / 100, subscribers: d.creators!.subscribers as number }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Creators</h1>
          <p className="page-lead">Find channels by size, niche and what they have done with sponsors before.</p>
        </div>
      </div>
      <CreatorsSubnav />
      {notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
      <PriceCalculator key={`${creatorRaw ?? ''}|${brandRaw ?? ''}`} prefill={prefill} fromName={fromName} sponsor={sponsor} pastDeals={pastDeals} />
    </>
  );
}
