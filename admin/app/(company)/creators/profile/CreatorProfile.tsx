// The creator profile: header, actions, sponsorship history, suggestions, performance, price, deals, outreach and notes.
// Server component, one query plan (all reads run together). mode "panel" = inside the side panel on the list page (one column);
// mode "page" = the full page at /creators/[id] (two columns). Showing email and phone writes one "creator.viewed" audit line.
import { cache } from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { Badge, LinkButton } from '@/components/ui';
import { DraftPitchButton } from '@/components/outreach/DraftPitchButton';
import { LinkButton as LinkToSponsor } from '@/components/matching/LinkButton';
import { Suggestions } from '@/components/matching/Suggestions';
import { SponsorshipHistory } from '@/components/sponsorships/SponsorshipHistory';
import { requireStaff } from '@/lib/auth/staff';
import { STATUS_LABEL, STATUS_TONE, type CreatorStatus } from '@/lib/creators/constants';
import { countryName, languageName, nicheName } from '@/lib/creators/profile-fields';
import { formatUsd } from '@/lib/deals/format';
import { cpmGroupForNiche, defaultPriceInput, formatMoney, priceSponsorship } from '@/lib/pricing';
import { fmtDate } from '@/lib/sponsorships/format';
import { createClient } from '@/lib/supabase/server';
import { youtubeEnabled } from '@/lib/youtube';
import { cleanVideoUrl } from '@/lib/sponsorships/schemas';
import { STATUS_LABEL as EMAIL_LABEL, STATUS_TONE as EMAIL_TONE } from '../../emails/status';
import { ago } from './format';
import { NotesEditor } from './NotesEditor';
import { ProfileActions } from './ProfileActions';
import { TagEditor } from './TagEditor';
import s from './profile.module.css';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (n: number) => n.toLocaleString('en-US');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1); // a sentence starts with a capital (C-2)
const NOT_KNOWN = <span className="muted">Not known</span>;
const NONE_ON_FILE = <span className="muted">None on file</span>;
const STAGE: Record<string, string> = { matched: 'Matched', contacted: 'Contacted', replied: 'Replied', negotiating: 'Negotiating', signed: 'Signed', completed: 'Completed', paid: 'Paid' };

type Creator = {
  id: string; full_name: string; email: string; phone: string | null; channel_url: string | null; channel_name: string | null;
  niche: string | null; niche_slug: string | null; subscribers: number | null; subscribers_hidden: boolean; subscribers_checked_at: string | null;
  status: CreatorStatus; notes: string | null; last_contacted_at: string | null; country: string | null; language: string | null;
  avg_views: number | null; avg_views_checked_at: string | null; last_video_at: string | null; uploads_per_month: number | null;
  engagement_rate: number | string | null; audience_countries: string | null;
};
type DealRow = { id: string; stage: string; amount_cents: number | null; stage_changed_at: string; brand: { id: string; name: string } | null };
type EmailRow = { id: string; subject: string; status: string; is_test: boolean; created_at: string; sent_at: string | null };

/** The one creator read of a request. Shared with the page title, so a full page asks once. */
export const loadCreator = cache(async (id: string): Promise<Creator | null> => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('creator_summaries').select('*').eq('id', id).maybeSingle();
  return (data as Creator | null) ?? null;
});

export async function CreatorProfile({ id, mode }: { id: string; mode: 'panel' | 'page' }) {
  const staff = await requireStaff();
  const c = await loadCreator(id);
  if (!c) {
    if (mode === 'page') notFound();
    return (
      <div className="state" role="status">
        <h2 className="state__title">This creator does not exist</h2>
        <p className="state__text">They may have been deleted.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [tagsRes, knownRes, dealsRes, emailsRes] = await Promise.all([
    supabase.from('creator_tags').select('tag:tags(id, name)').eq('creator_id', id),
    supabase.from('tags').select('name').eq('scope', 'creator').order('name').limit(500),
    supabase.from('deals').select('id, stage, amount_cents, stage_changed_at, brand:brands(id, name)').eq('creator_id', id).order('stage_changed_at', { ascending: false }).limit(50),
    supabase.from('emails').select('id, subject, status, is_test, created_at, sent_at').eq('creator_id', id).order('created_at', { ascending: false }).limit(30),
  ]);
  const tags = ((tagsRes.data ?? []) as unknown as { tag: { id: string; name: string } | null }[]).flatMap((r) => (r.tag ? [r.tag] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
  const known = (knownRes.data ?? []).map((t) => String(t.name));
  const deals = (dealsRes.data ?? []) as unknown as DealRow[];
  const emails = (emailsRes.data ?? []) as unknown as EmailRow[];

  // One view, one line: written after the response (the page does not wait). Skipped for a refresh caused by one of this
  // page's own actions (the request then carries "next-action") and for link prefetches, so only a real view is logged.
  const h = await headers();
  if (!h.get('next-action') && !h.get('next-router-prefetch')) {
    after(async () => {
      try {
        const { error } = await supabase.rpc('log_audit', { action: 'creator.viewed', entity_type: 'creator', entity_id: c.id, details: { label: c.full_name } });
        if (error) console.error('audit write failed creator.viewed', error.code);
      } catch (e) {
        console.error('audit write failed creator.viewed', e instanceof Error ? e.message : e);
      }
    });
  }

  const isOwner = staff.role === 'owner';
  const Heading = mode === 'page' ? 'h1' : 'h2';
  const checked = ago(c.subscribers_checked_at);
  const niche = nicheName(c.niche_slug) ?? c.niche;
  const where = [countryName(c.country), languageName(c.language)].filter(Boolean).join(', ');
  const contacted = c.last_contacted_at ? `${fmtDate(c.last_contacted_at)} (${ago(c.last_contacted_at)})` : 'Never';
  const secure = !!c.channel_url && cleanVideoUrl(c.channel_url) !== null; // https on a YouTube host, checked again at render (SR-09)

  const head = (
    <div className={s.head}>
      <div className={s.badges}>
        <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
        <TagEditor creatorId={c.id} tags={tags} known={known} />
      </div>
      <Heading>{c.full_name}</Heading>
      <p className={s.channel}>
        {c.channel_name || c.channel_url ? (
          c.channel_url && secure
            ? <a href={c.channel_url} target="_blank" rel="noopener noreferrer">{c.channel_name || 'Open the channel'}</a>
            : c.channel_name
        ) : 'No channel on file'}
      </p>
      <dl className="dl">
        <dt>Subscribers</dt>
        <dd className={s.num}>
          {c.subscribers_hidden ? 'Hidden by the channel' : c.subscribers == null ? NOT_KNOWN : num(c.subscribers)}
          {c.subscribers_hidden && c.subscribers != null ? <span className="muted"> (last known: {num(c.subscribers)})</span> : null}
          <span className={`muted ${s.small}`}>{checked ? ` · checked ${checked}` : ' · never checked'}</span>
        </dd>
        <dt>Average views</dt>
        <dd className={s.num}>{c.avg_views == null ? NOT_KNOWN : <>{num(c.avg_views)}{c.avg_views_checked_at ? <span className={`muted ${s.small}`}> · checked {ago(c.avg_views_checked_at)}</span> : null}</>}</dd>
        <dt>Niche</dt>
        <dd>{niche ?? NOT_KNOWN}{!c.niche_slug && c.niche ? <span className={`muted ${s.small}`}> (free text, not from the list)</span> : null}</dd>
        <dt>Country, language</dt>
        <dd>{where || NOT_KNOWN}</dd>
        <dt>Email</dt>
        <dd>{c.email ? c.email : NONE_ON_FILE}</dd>
        <dt>Phone</dt>
        <dd>{c.phone ? c.phone : NONE_ON_FILE}</dd>
        <dt>Last contacted</dt>
        <dd>{contacted}</dd>
        <dt>Uploads</dt>
        <dd>{c.uploads_per_month == null && !c.last_video_at ? NOT_KNOWN : (
          <>{c.uploads_per_month != null ? `About ${c.uploads_per_month} a month` : 'Uploads a month not known'}{c.last_video_at ? `, last one ${ago(c.last_video_at)}` : ''}</>
        )}</dd>
      </dl>
      <div className={s.actions}>
        <LinkToSponsor creatorId={c.id} label="Link to a sponsor" />
        <DraftPitchButton creatorId={c.id} />
        <LinkButton href={`/creators?creator=${c.id}&edit=1`} variant="ghost" size="sm">Edit</LinkButton>
        <ProfileActions creatorId={c.id} name={c.full_name} isOwner={isOwner} youtubeEnabled={youtubeEnabled()} />
      </div>
    </div>
  );

  const performance = (
    <section className="panel-sec" aria-labelledby={`perf-${c.id}`}>
      <h3 id={`perf-${c.id}`}>Performance</h3>
      <dl className="dl">
        <dt>Average views</dt><dd className={s.num}>{c.avg_views == null ? NOT_KNOWN : num(c.avg_views)}</dd>
        <dt>Uploads a month</dt><dd className={s.num}>{c.uploads_per_month == null ? NOT_KNOWN : c.uploads_per_month}</dd>
        <dt>Last upload</dt><dd>{c.last_video_at ? `${fmtDate(c.last_video_at)} (${ago(c.last_video_at)})` : NOT_KNOWN}</dd>
        <dt>Engagement rate</dt><dd className={s.num}>{c.engagement_rate == null ? NOT_KNOWN : `${Number(c.engagement_rate)}%`}</dd>
        <dt>Audience countries</dt><dd>{c.audience_countries || NOT_KNOWN}</dd>
      </dl>
    </section>
  );

  const price = <PriceBox c={c} />;

  const dealsSection = (
    <section className="panel-sec" aria-labelledby={`deals-${c.id}`}>
      <h3 id={`deals-${c.id}`}>Deals</h3>
      {deals.length ? deals.map((d) => (
        <div key={d.id} className={s.dealRow}>
          <span>{d.brand ? <Link href={`/sponsors/${d.brand.id}`}>{d.brand.name}</Link> : 'Unknown sponsor'} <Badge>{STAGE[d.stage] ?? d.stage}</Badge></span>
          <span className={`muted ${s.num}`}>{d.amount_cents == null ? 'Amount not set' : formatUsd(d.amount_cents)} · changed {ago(d.stage_changed_at)}</span>
        </div>
      )) : <p className="muted">No deals yet. Use “Link to a sponsor” to start one.</p>}
    </section>
  );

  const outreach = (
    <section className="panel-sec" aria-labelledby={`out-${c.id}`}>
      <h3 id={`out-${c.id}`}>Outreach history</h3>
      {emails.length ? emails.map((e) => (
        <div key={e.id} className={s.dealRow}>
          <Link href={`/emails/${e.id}`}>{e.subject || '(no subject)'}</Link>
          <span className={s.rowMeta}>
            <Badge tone={EMAIL_TONE[e.status] ?? 'neutral'}>{EMAIL_LABEL[e.status] ?? e.status}</Badge>
            {e.is_test ? <Badge>Test</Badge> : null}
            <span className={s.small}>{fmtDate(e.sent_at ?? e.created_at)}</span>
          </span>
        </div>
      )) : <p className="muted">Nobody has written to them yet.</p>}
    </section>
  );

  const notes = (
    <section className="panel-sec" aria-labelledby={`notes-${c.id}`}>
      <h3 id={`notes-${c.id}`}>Notes</h3>
      <NotesEditor key={c.id} creatorId={c.id} initial={c.notes ?? ''} />
    </section>
  );
  const history = <SponsorshipHistory side="creator" id={c.id} />;
  const suggestions = <Suggestions side="creator" id={c.id} />;

  if (mode === 'page') {
    return (
      <div className={s.pgrid}>
        <div>{head}{history}{performance}</div>
        <aside>{suggestions}{price}{dealsSection}{outreach}{notes}</aside>
      </div>
    );
  }
  return <>{head}{history}{suggestions}{performance}{price}{dealsSection}{outreach}{notes}</>;
}

function PriceBox({ c }: { c: Creator }) {
  const calc = `/creators/calculator?creator=${c.id}`;
  const result = c.avg_views
    ? priceSponsorship(defaultPriceInput({
        name: c.full_name, niche: cpmGroupForNiche(c.niche_slug ?? ''), subs: c.subscribers, views: c.avg_views,
        eng: c.engagement_rate == null ? null : Number(c.engagement_rate), aud: c.audience_countries ?? '', margin: 20,
      }))
    : null;
  const missing = [c.engagement_rate == null ? 'the engagement rate' : null, c.audience_countries ? null : 'the audience countries'].filter(Boolean);
  return (
    <section className="panel-sec" aria-labelledby={`price-${c.id}`}>
      <h3 id={`price-${c.id}`}>Fair sponsorship price</h3>
      {result ? (
        <>
          <p className={s.price}>{formatMoney(result.price[0])} to {formatMoney(result.price[2])} <span className={`muted ${s.small}`} style={{ fontFamily: 'var(--font-sans)' }}>for a 60-second integration</span></p>
          <p className={s.priceNote}>
            Suggested asking price: {formatMoney(result.ask)}. From {num(c.avg_views!)} average views and the usual CPM for the niche.
            {missing.length ? ` ${cap(missing.join(' and '))} ${missing.length === 1 ? 'is' : 'are'} not on file, so nothing was adjusted for ${missing.length === 1 ? 'it' : 'them'}.` : ''} A starting point, never used in a first email.
          </p>
        </>
      ) : (
        <p className={s.priceNote}>No price yet: the average views are not on file. Add them with Edit, or type them into the calculator.</p>
      )}
      <LinkButton href={calc} variant="ghost" size="sm">Open in the calculator</LinkButton>
    </section>
  );
}
