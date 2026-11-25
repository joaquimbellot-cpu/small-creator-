// One sponsor's profile, used by the side panel (mode "panel") and the full page (mode "page").
// Server component: loads the sponsor, its contact people, tags and deals, and puts the shared slots where the prototype shows them.
// Showing contact details writes the audit line "brand.viewed" after the response (no email or phone in it).
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { Badge, Notice } from '@/components/ui';
import { DraftPitchButton } from '@/components/outreach/DraftPitchButton';
import { OutreachHistory } from '@/components/outreach/OutreachHistory';
import { LinkButton as LinkToCreator } from '@/components/matching/LinkButton';
import { Suggestions } from '@/components/matching/Suggestions';
import { SponsorshipHistory } from '@/components/sponsorships/SponsorshipHistory';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { DEAL_STAGE_LABEL, RELATIONSHIP_LABEL, RELATIONSHIP_TONE, countryName, type Relationship } from '@/lib/sponsors/constants';
import { UUID_RE } from '@/lib/sponsors/filters';
import { companySizeText, formatBudget, formatDate, formatTarget, nicheNames, toFormValues, usd } from '@/lib/sponsors/format';
import { isHttpsUrl } from '@/lib/sponsors/schema';
import { SponsorDialog } from '../SponsorDialog';
import s from '../sponsors.module.css';
import { ContactPeople, type Contact } from './ContactPeople';
import { NotesEditor } from './NotesEditor';
import { TagEditor } from './TagEditor';
import { DeleteSponsor } from './ProfileActions';

type DealRow = { id: string; stage: string; amount_cents: number | null; stage_changed_at: string; creators: { id: string; full_name: string } | { id: string; full_name: string }[] | null };

export async function SponsorProfile({ id, mode }: { id: string; mode: 'panel' | 'page' }) {
  const staff = await requireStaff();
  if (!UUID_RE.test(id)) return mode === 'page' ? notFound() : <Notice tone="error">This sponsor could not be found.</Notice>;
  const supabase = await createClient();
  const [brand, people, tagRows, dealRows, knownTags] = await Promise.all([
    supabase.from('brand_summaries').select('*').eq('id', id).maybeSingle(),
    supabase.from('brand_contacts').select('id, full_name, role_title, email, phone, linkedin_url, is_primary').eq('brand_id', id)
      .order('is_primary', { ascending: false }).order('full_name'),
    supabase.from('brand_tags').select('tags(id, name)').eq('brand_id', id),
    supabase.from('deals').select('id, stage, amount_cents, stage_changed_at, creators(id, full_name)').eq('brand_id', id).order('stage_changed_at', { ascending: false }),
    supabase.from('tags').select('name').eq('scope', 'brand').order('name').limit(200),
  ]);
  if (brand.error || people.error || tagRows.error || dealRows.error) {
    return <Notice tone="error">The sponsor could not be loaded. Close this and try again.</Notice>;
  }
  const b = brand.data;
  if (!b) return mode === 'page' ? notFound() : <Notice tone="error">This sponsor no longer exists. It may have been deleted.</Notice>;

  // One line per profile view, written after the response so the page does not wait. It reuses this request's client
  // (logAudit() would read cookies again, which is not allowed inside after()). Only the name goes in, never an email or phone.
  // Skipped for a refresh caused by this profile's own actions ("next-action") and for link prefetches, so one view is one line.
  const h = await headers();
  if (!h.get('next-action') && !h.get('next-router-prefetch')) {
    after(async () => {
      try {
        const { error } = await supabase.rpc('log_audit', { action: 'brand.viewed', entity_type: 'brand', entity_id: id, details: { label: String(b.name).slice(0, 200), mode } });
        if (error) console.error('audit write failed brand.viewed', error.code);
      } catch (e) {
        console.error('audit write failed brand.viewed', e instanceof Error ? e.message : e);
      }
    });
  }

  const contacts = (people.data ?? []) as Contact[];
  const tags = (tagRows.data ?? []).flatMap((r) => (Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : [])) as { id: string; name: string }[];
  const deals = ((dealRows.data ?? []) as unknown as DealRow[]).map((d) => ({ ...d, creator: Array.isArray(d.creators) ? d.creators[0] : d.creators }));
  const rel = b.relationship as Relationship;
  const niches = nicheNames((b.target_niches ?? []) as string[]);
  const site = b.website && isHttpsUrl(b.website) ? b.website : null;
  const isOwner = staff.role === 'owner';
  const more = b.detected_sponsorship_count > 0 ? `, ${b.detected_sponsorship_count} more detected` : '';
  const Title = mode === 'page' ? 'h1' : 'h2';

  const head = (
    <div>
      <div className={s.tags}>
        <Badge tone={RELATIONSHIP_TONE[rel]}>{RELATIONSHIP_LABEL[rel]}</Badge>
        <TagEditor brandId={id} tags={tags} known={(knownTags.data ?? []).map((t) => String(t.name))} />
      </div>
      <Title className="panel-head">{b.name}</Title>
      <p className={s.lead}>
        {b.industry ?? 'Industry not set'}
        {b.website ? <> · {site ? <a href={site} target="_blank" rel="noopener noreferrer">{site.replace(/^https:\/\//, '')}</a> : <span>{b.website}</span>}</> : null}
      </p>
      <dl className="dl">
        <dt>Location</dt><dd>{b.country ? countryName(b.country) : <span className="muted">Not set</span>}</dd>
        <dt>Company size</dt><dd>{b.company_size ? companySizeText(b.company_size) : <span className="muted">Not set</span>}</dd>
        <dt>Niches they sponsor</dt><dd>{niches.length ? niches.join(', ') : <span className="muted">Not set</span>}</dd>
        <dt>Target creator size</dt><dd>{b.target_min_subs == null && b.target_max_subs == null ? <span className="muted">Not set</span> : `${formatTarget(b.target_min_subs, b.target_max_subs, true)} subscribers`}</dd>
        <dt>Typical budget</dt><dd>{b.budget_min_cents == null && b.budget_max_cents == null ? <span className="muted">Not set</span> : `${formatBudget(b.budget_min_cents, b.budget_max_cents)} per creator`}</dd>
        <dt>Creators sponsored</dt><dd>{b.sponsorship_count} confirmed{more}</dd>
        <dt>Last contacted</dt><dd>{b.last_contacted_at ? formatDate(b.last_contacted_at) : 'Never'}</dd>
      </dl>
      <div className={s.actions}>
        <LinkToCreator brandId={id} label="Link to a creator" />
        <DraftPitchButton brandId={id} />
        <SponsorDialog mode="edit" initial={toFormValues(b as Parameters<typeof toFormValues>[0])} label="Edit" variant="ghost" />
        {isOwner ? <DeleteSponsor id={id} name={String(b.name)} /> : null}
      </div>
    </div>
  );

  const dealsSection = (
    <section className="panel-sec" aria-labelledby={`deals-${id}`}>
      <h3 id={`deals-${id}`}>Deals</h3>
      {deals.length === 0 ? <p className="muted">No deals yet. Use Link to a creator to start one.</p> : deals.map((d) => (
        <div key={d.id} className={s.dealRow}>
          <span>
            {d.creator ? <Link href={`/creators/${d.creator.id}`}>{d.creator.full_name}</Link> : 'Creator not found'}{' '}
            <Badge>{DEAL_STAGE_LABEL[d.stage] ?? d.stage}</Badge>
          </span>
          <span className="muted">{d.amount_cents == null ? 'Amount not set' : usd(d.amount_cents)} · {formatDate(d.stage_changed_at)}</span>
        </div>
      ))}
    </section>
  );

  const main = (
    <>
      {head}
      <ContactPeople brandId={id} contacts={contacts} isOwner={isOwner} />
      <SponsorshipHistory side="brand" id={id} />
    </>
  );
  const rest = (
    <>
      <Suggestions side="brand" id={id} />
      {dealsSection}
      <OutreachHistory side="brand" id={id} />
      <NotesEditor key={id} id={id} initial={b.notes ?? ''} />
    </>
  );
  return mode === 'page' ? <div className={s.pgrid}><div>{main}</div><aside>{rest}</aside></div> : <>{main}{rest}</>;
}
