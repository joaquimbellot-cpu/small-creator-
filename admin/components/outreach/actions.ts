'use server';
// Server actions of "Draft pitch with Claude". Every one checks the role (any staff member, the same as Compose: drafting
// uses Claude but sends nothing) and validates its input. Nothing here sends an email: the draft is saved with status
// 'draft', and only the Send button on the Review page (POST /api/emails/<id>/send) sends.
// No action returns an email address or a phone number. The facts for Claude come from lib/drafting/pitch-facts.ts only.
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { requireStaff } from '@/lib/auth/staff';
import { searchFilter } from '@/lib/creators/filters';
import { draftPitch } from '@/lib/drafting/pitch';
import { buildPitchFacts } from '@/lib/drafting/pitch-facts';
import { isMockMode } from '@/lib/drafting';
import { createClient } from '@/lib/supabase/server';

const Id = z.guid();
const Query = z.string().trim().max(100);

export type PickItem = { id: string; name: string; detail: string };
export type PairInfo = {
  creator: { id: string; name: string; blocked: boolean; hasEmail: boolean; suppressed: boolean } | null;
  sponsor: { id: string; name: string; blocked: boolean; contacts: { id: string; name: string; role: string | null; hasEmail: boolean; suppressed: boolean }[] } | null;
};
export type PitchResult =
  | { ok: true; emailId: string; subject: string; body: string; used: string[]; leftOut: string[]; mock: boolean }
  | { ok: false; error: string };

const FAIL = { error: 'Could not load that. Try again.' } as const;

/** Up to 20 creators by name, channel or address. Names and channels only come back. */
export async function searchCreatorsAction(q: string): Promise<{ items: PickItem[]; error?: string }> {
  await requireStaff();
  const parsed = Query.safeParse(q);
  if (!parsed.success) return { items: [], ...FAIL };
  const supabase = await createClient();
  let query = supabase.from('creators').select('id, full_name, channel_name, status').order('full_name').limit(20);
  const filter = searchFilter(parsed.data);
  if (filter) query = query.or(filter);
  const { data, error } = await query;
  if (error) return { items: [], ...FAIL };
  return { items: (data ?? []).map((c) => ({ id: c.id, name: c.full_name, detail: [c.channel_name, c.status === 'do_not_contact' ? 'Do not contact' : null].filter(Boolean).join(' · ') })) };
}

/** Up to 20 sponsors by name. */
export async function searchSponsorsAction(q: string): Promise<{ items: PickItem[]; error?: string }> {
  await requireStaff();
  const parsed = Query.safeParse(q);
  if (!parsed.success) return { items: [], ...FAIL };
  const supabase = await createClient();
  let query = supabase.from('brands').select('id, name, industry, relationship').order('name').limit(20);
  const term = parsed.data.replace(/[\\%_*,()"]/g, ' ').trim();
  if (term) query = query.ilike('name', `%${term}%`);
  const { data, error } = await query;
  if (error) return { items: [], ...FAIL };
  return { items: (data ?? []).map((b) => ({ id: b.id, name: b.name, detail: [b.industry, b.relationship === 'do_not_contact' ? 'Do not contact' : null].filter(Boolean).join(' · ') })) };
}

/** Names, who is blocked, and who has an address: enough for the dialog to explain itself, no addresses. */
export async function pairInfoAction(input: { creatorId?: string; brandId?: string }): Promise<PairInfo & { error?: string }> {
  await requireStaff();
  const parsed = z.object({ creatorId: Id.optional(), brandId: Id.optional() }).safeParse(input);
  if (!parsed.success) return { creator: null, sponsor: null, ...FAIL };
  const { creatorId, brandId } = parsed.data;
  const supabase = await createClient();
  const out: PairInfo & { error?: string } = { creator: null, sponsor: null };
  if (creatorId) {
    const { data } = await supabase.from('creators').select('id, full_name, email, status').eq('id', creatorId).maybeSingle();
    if (data) {
      const { data: sup } = data.email ? await supabase.from('suppression_list').select('email').eq('email', data.email) : { data: [] };
      out.creator = { id: data.id, name: data.full_name, blocked: data.status === 'do_not_contact', hasEmail: !!data.email, suppressed: (sup ?? []).length > 0 };
    }
  }
  if (brandId) {
    const { data } = await supabase.from('brands').select('id, name, relationship').eq('id', brandId).maybeSingle();
    if (data) {
      const { data: contacts } = await supabase.from('brand_contacts').select('id, full_name, role_title, email, is_primary').eq('brand_id', brandId).order('is_primary', { ascending: false }).order('full_name').limit(20);
      const addresses = (contacts ?? []).map((k) => k.email).filter((e): e is string => !!e);
      const { data: sup } = addresses.length ? await supabase.from('suppression_list').select('email').in('email', addresses) : { data: [] };
      const blockedSet = new Set((sup ?? []).map((s) => String(s.email).toLowerCase()));
      out.sponsor = {
        id: data.id, name: data.name, blocked: data.relationship === 'do_not_contact',
        contacts: (contacts ?? []).map((k) => ({ id: k.id, name: k.full_name, role: k.role_title, hasEmail: !!k.email, suppressed: !!k.email && blockedSet.has(String(k.email).toLowerCase()) })),
      };
    }
  }
  return out;
}

const DraftInput = z.object({ creatorId: Id, brandId: Id, to: z.enum(['creator', 'sponsor']), contactId: Id.optional() });

export async function draftPitchAction(input: { creatorId: string; brandId: string; to: 'creator' | 'sponsor'; contactId?: string }): Promise<PitchResult> {
  const staff = await requireStaff();
  const parsed = DraftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Pick a creator and a sponsor first.' };
  const { creatorId, brandId, to } = parsed.data;
  const supabase = await createClient();

  // 1. Who: both rows, and the plain refusals.
  const [{ data: creator }, { data: sponsor }] = await Promise.all([
    supabase.from('creators').select('id, full_name, email, status, channel_name, channel_url, niche, niche_slug, subscribers, subscribers_hidden, avg_views').eq('id', creatorId).maybeSingle(),
    supabase.from('brands').select('id, name, industry, relationship, target_niches, target_min_subs, target_max_subs').eq('id', brandId).maybeSingle(),
  ]);
  if (!creator || !sponsor) return { ok: false, error: 'The creator or the sponsor could not be found.' };
  if (creator.status === 'do_not_contact') return { ok: false, error: `${creator.full_name} is marked Do not contact. No pitch can be drafted.` };
  if (sponsor.relationship === 'do_not_contact') return { ok: false, error: `${sponsor.name} is marked Do not contact. No pitch can be drafted.` };

  // 2. Where it goes: the address is read here, on the server, and never leaves it.
  let toEmail: string;
  let contact: { id: string; full_name: string } | null = null;
  if (to === 'creator') {
    if (!creator.email) return { ok: false, error: `${creator.full_name} has no email address on file.` };
    toEmail = creator.email;
  } else {
    const { data: contacts } = await supabase.from('brand_contacts').select('id, full_name, email, is_primary').eq('brand_id', brandId).order('is_primary', { ascending: false }).order('full_name').limit(20);
    if (!contacts?.length) return { ok: false, error: `${sponsor.name} has no contact person yet. Add one on the sponsor page.` };
    const chosen = parsed.data.contactId ? contacts.find((k) => k.id === parsed.data.contactId) : contacts.length === 1 ? contacts[0] : undefined;
    if (!chosen) return { ok: false, error: parsed.data.contactId ? 'That contact person does not belong to this sponsor.' : 'Choose the contact person.' };
    if (!chosen.email) return { ok: false, error: `${chosen.full_name} has no email address on file.` };
    toEmail = chosen.email;
    contact = { id: chosen.id, full_name: chosen.full_name };
  }
  const { data: opted } = await supabase.from('suppression_list').select('email').eq('email', toEmail).limit(1);
  if (opted?.length) return { ok: false, error: 'This address is on the opt-out list. No pitch can be drafted.' };

  // 3. The facts. Past sponsorships come from the view of confirmed records only. Detected records are read only to
  //    be listed under "Left out" on screen; they are not part of anything sent to Claude.
  const [nichesRes, confirmedRes, detectedRes, sponsorRowsRes, knownRes] = await Promise.all([
    supabase.from('niches').select('slug, name'),
    supabase.from('creator_sponsorship_facts').select('brand_id, brand_name, sponsored_on').eq('creator_id', creatorId).limit(200),
    supabase.from('sponsorships').select('brand_name_raw, sponsored_on, rejected, brands(name)').eq('creator_id', creatorId).eq('source_label', 'detected').eq('rejected', false).limit(50),
    supabase.from('creator_sponsorship_facts').select('creator_id').eq('brand_id', brandId).neq('creator_id', creatorId).limit(1000),
    supabase.from('brands').select('name').limit(2000),
  ]);
  if (nichesRes.error || confirmedRes.error || detectedRes.error || sponsorRowsRes.error) return { ok: false, error: 'The facts could not be loaded. Try again.' };
  const nicheNames = Object.fromEntries((nichesRes.data ?? []).map((n) => [n.slug, n.name]));

  // Other channels in this niche that the sponsor has confirmed sponsorships with.
  const otherIds = [...new Set((sponsorRowsRes.data ?? []).map((r) => r.creator_id as string))];
  let similar = 0;
  if (otherIds.length) {
    const { data: others } = await supabase.from('creators').select('id, niche, niche_slug').in('id', otherIds);
    const lower = (creator.niche ?? '').trim().toLowerCase();
    similar = (others ?? []).filter((o) => (creator.niche_slug ? o.niche_slug === creator.niche_slug : lower !== '' && (o.niche ?? '').trim().toLowerCase() === lower)).length;
  }

  const detected = (detectedRes.data ?? []).map((d) => {
    const b = (d as unknown as { brands: { name: string } | null }).brands;
    return { brand_name: b?.name ?? d.brand_name_raw, sponsored_on: d.sponsored_on, rejected: d.rejected };
  });
  const { facts, lists, blocked } = buildPitchFacts({
    direction: to === 'creator' ? 'to_creator' : 'to_sponsor',
    creator,
    sponsor: { ...sponsor, target_niches: sponsor.target_niches ?? [] },
    nicheNames,
    confirmed: confirmedRes.data ?? [],
    detected,
    similarChannels: similar,
    contactName: contact?.full_name ?? null,
  });
  if (blocked) return { ok: false, error: `No draft was written: ${blocked}. Correct it on the sponsor page and try again.` };
  // Every sponsor name we know: the validator refuses a draft that names any sponsor that is not in the facts.
  const known = [...new Set([...(knownRes.data ?? []).map((b) => b.name as string), ...detected.map((d) => d.brand_name).filter((n): n is string => !!n)])];

  // 4. Claude (or the mock) and the pitch checks. A draft that fails them is not saved.
  const result = await draftPitch(facts, known);
  if (!result.ok) {
    return { ok: false, error: result.reason === 'checks' ? `The draft broke a rule, so it was not saved: ${result.error} Try again.` : result.error };
  }

  // 5. Save as a draft, never approved. The database guard repeats the do-not-contact and opt-out checks.
  const mock = isMockMode();
  const { data: saved, error } = await supabase
    .from('emails')
    .insert({
      creator_id: creatorId,
      to_email: toEmail,
      subject: result.draft.subject,
      body: result.draft.body,
      source: mock ? 'template' : 'claude',
      brand_id: brandId,
      recipient_kind: to === 'creator' ? 'creator' : 'brand_contact',
      brand_contact_id: contact?.id ?? null,
      pitch_facts: { used: lists.used, left_out: lists.leftOut },
    })
    .select('id')
    .single();
  if (error || !saved) {
    console.error('pitch: save failed', error?.code);
    return { ok: false, error: 'The draft could not be saved. The creator or the sponsor may be blocked.' };
  }
  await logAudit('email.drafted', 'email', saved.id, { mock, pitch: true, by: staff.id, creator_id: creatorId, brand_id: brandId, direction: to });
  return { ok: true, emailId: saved.id, subject: result.draft.subject, body: result.draft.body, used: lists.used, leftOut: lists.leftOut, mock };
}
