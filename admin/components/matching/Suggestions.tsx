// "Suggested sponsors" for a creator (side "creator") or "Suggested creators" for a sponsor (side "brand"): up to five
// pairs that score 40 or more, each with its reasons, a Link button and a Draft pitch button. Server component; the score is
// worked out in the database (match_for_creator / match_for_brand), so row level security applies. Never shows a score alone.
import Link from 'next/link';
import { Notice, ScoreReasons } from '@/components/ui';
import { DraftPitchButton } from '@/components/outreach/DraftPitchButton';
import { NICHES } from '@/lib/creators/constants';
import { formatUsd } from '@/lib/deals/format';
import { formatShort } from '@/lib/lists/numbers';
import { pickSuggestions } from '@/lib/matching';
import { matchesForBrand, matchesForCreator } from '@/lib/matching/load';
import { createClient } from '@/lib/supabase/server';
import { LinkButton } from './LinkButton';
import m from './matching.module.css';

type Side = 'creator' | 'brand';
type Line = { name: string; line: string };

export async function Suggestions({ side, id }: { side: Side; id: string }) {
  const title = side === 'creator' ? 'Suggested sponsors' : 'Suggested creators';
  const supabase = await createClient();
  try {
    // Is this record itself off limits?
    const own = side === 'creator'
      ? await supabase.from('creators').select('status').eq('id', id).maybeSingle()
      : await supabase.from('brands').select('relationship').eq('id', id).maybeSingle();
    if (own.error) throw own.error;
    const dnc = side === 'creator' ? (own.data as { status?: string } | null)?.status === 'do_not_contact' : (own.data as { relationship?: string } | null)?.relationship === 'do_not_contact';
    if (dnc) {
      return (
        <section className="panel-sec" aria-label={title}>
          <h3>{title}</h3>
          <Notice tone="warn">Marked Do not contact, so nothing is suggested and no pitch can be drafted.</Notice>
        </section>
      );
    }

    const picks = pickSuggestions(side === 'creator' ? await matchesForCreator(supabase, id) : await matchesForBrand(supabase, id));
    const ids = picks.map((p) => p.otherId);
    const lines = new Map<string, Line>();
    if (ids.length) {
      if (side === 'creator') {
        const { data, error } = await supabase.from('brands').select('id, name, industry, budget_min_cents, budget_max_cents').in('id', ids);
        if (error) throw error;
        for (const b of data ?? []) {
          const budget = b.budget_min_cents != null && b.budget_max_cents != null ? `budget ${formatUsd(Number(b.budget_min_cents))} to ${formatUsd(Number(b.budget_max_cents))}` : null;
          lines.set(b.id, { name: b.name, line: [b.industry, budget].filter(Boolean).join(' · ') });
        }
      } else {
        const { data, error } = await supabase.from('creators').select('id, full_name, channel_name, niche_slug, subscribers, subscribers_hidden').in('id', ids);
        if (error) throw error;
        for (const c of data ?? []) {
          const subs = c.subscribers_hidden ? null : c.subscribers != null ? `${formatShort(c.subscribers)} subscribers` : null;
          lines.set(c.id, { name: c.full_name, line: [c.channel_name, c.niche_slug ? NICHES[c.niche_slug as keyof typeof NICHES] : null, subs].filter(Boolean).join(' · ') });
        }
      }
    }
    const shown = picks.filter((p) => lines.has(p.otherId));

    return (
      <section className="panel-sec" aria-label={title}>
        <h3>{title}</h3>
        {shown.length === 0 ? (
          <p className="muted">No match scores 40 or more yet. Scores improve as sponsor targets and confirmed sponsorships are filled in.</p>
        ) : shown.map((p) => {
          const o = lines.get(p.otherId)!;
          const creatorId = side === 'creator' ? id : p.otherId;
          const brandId = side === 'creator' ? p.otherId : id;
          return (
            <div key={p.otherId} className={m.sug}>
              <div className={m.sugHead}>
                <Link className={m.sugName} href={side === 'creator' ? `/sponsors/${p.otherId}` : `/creators/${p.otherId}`} prefetch={false}>{o.name}</Link>
              </div>
              {o.line ? <p className={m.sugLine}>{o.line}</p> : null}
              <ScoreReasons total={p.total} reasons={p.reasons} />
              <div className={m.sugActions}>
                <LinkButton creatorId={creatorId} brandId={brandId} label="Link" />
                <DraftPitchButton creatorId={creatorId} brandId={brandId} />
              </div>
            </div>
          );
        })}
        <p className={m.note}>Score out of 100: niche fit 40, size fit 25, similar creators 20, recency 15. Pairs already linked, or sponsored in the last 180 days, are left out.</p>
      </section>
    );
  } catch (e) {
    console.error('matching: suggestions failed', (e as { code?: string })?.code);
    return (
      <section className="panel-sec" aria-label={title}>
        <h3>{title}</h3>
        <Notice tone="error">The suggestions could not be loaded. Refresh the page to try again.</Notice>
      </section>
    );
  }
}
