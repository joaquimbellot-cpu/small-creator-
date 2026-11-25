'use server';
// Sponsorship records: add, edit, confirm, reject, restore. Staff only; input is checked with zod; every write goes through the
// user's own Supabase client, so row security and the database rules apply (the database sets who confirmed and when).
// Audit lines come from the database triggers (sponsorship.created / updated / confirmed / rejected / restored).
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { cleanVideoUrl, confirmSchema, firstError, idSchema, recordSchema, sideSchema } from './schemas';
import { plainError } from './errors';
import type { ActionResult, PartyOption, SponsorshipSide } from './types';

const GONE = 'This record no longer exists. Refresh the page.';

type Db = Awaited<ReturnType<typeof createClient>>;
function refresh(creatorIds: (string | null | undefined)[], brandIds: (string | null | undefined)[]) {
  for (const id of new Set(creatorIds)) if (id) revalidatePath(`/creators/${id}`);
  for (const id of new Set(brandIds)) if (id) revalidatePath(`/sponsors/${id}`);
  revalidatePath('/creators');
  revalidatePath('/sponsors');
}

/** Finds a sponsor by name (the column is citext, so case is ignored). Creates it only when `allowCreate` is true (B-4). */
async function findOrCreateBrand(supabase: Db, name: string, allowCreate: boolean): Promise<{ id: string; created: boolean } | { missing: true } | null> {
  const { data: found } = await supabase.from('brands').select('id').eq('name', name).maybeSingle();
  if (found) return { id: found.id as string, created: false };
  if (!allowCreate) return { missing: true };
  const { data: created, error } = await supabase.from('brands').insert({ name }).select('id').single();
  if (!error && created) return { id: created.id as string, created: true };
  const { data: again } = await supabase.from('brands').select('id').eq('name', name).maybeSingle(); // made a moment ago by someone else
  return again ? { id: again.id as string, created: false } : null;
}

const noSponsor = (name: string) => `No sponsor called “${name}” yet. Use “Add ${name} as a new sponsor”, or pick one from the list.`;

/** Add a record. It is saved as Confirmed: the database stamps the signed-in person and the time. */
export async function addSponsorship(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = recordSchema().safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const d = p.data;
  const supabase = await createClient();

  let brandId: string | null = d.brandId ?? null;
  let created: string | undefined;
  if (!brandId) {
    if (!d.brandName) return { ok: false, error: 'Choose the sponsor, or type its name.' };
    const b = await findOrCreateBrand(supabase, d.brandName, d.createBrand);
    if (!b) return { ok: false, error: 'Could not save the sponsor name. Try again.' };
    if ('missing' in b) return { ok: false, error: noSponsor(d.brandName) };
    brandId = b.id;
    if (b.created) created = d.brandName;
  }
  const { error } = await supabase.from('sponsorships').insert({
    creator_id: d.creatorId, brand_id: brandId, sponsored_on: d.date,
    video_url: cleanVideoUrl(d.videoUrl) || null, video_title: d.videoTitle || null, evidence_note: d.note || null,
    source_label: 'confirmed', origin: 'manual',
  });
  if (error) return { ok: false, error: plainError(error) };
  refresh([d.creatorId], [brandId]);
  return { ok: true, message: created ? `Record added as Confirmed. “${created}” was added as a new sponsor.` : 'Record added as Confirmed.', brandCreated: created };
}

/** Edit a record. A detected record stays detected; a confirmed one keeps who confirmed it. */
export async function updateSponsorship(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = recordSchema().safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const d = p.data;
  if (!d.id) return { ok: false, error: GONE };
  const supabase = await createClient();

  const { data: cur, error: readErr } = await supabase.from('sponsorships').select('id, creator_id, brand_id, source_label, rejected').eq('id', d.id).maybeSingle();
  if (readErr) return { ok: false, error: plainError(readErr) };
  if (!cur) return { ok: false, error: GONE };
  if (cur.rejected) return { ok: false, error: 'Restore this record before editing it.' };

  let brandId: string | null = d.brandId ?? null;
  let created: string | undefined;
  if (!brandId && d.brandName) {
    const b = await findOrCreateBrand(supabase, d.brandName, d.createBrand);
    if (!b) return { ok: false, error: 'Could not save the sponsor name. Try again.' };
    if ('missing' in b) return { ok: false, error: noSponsor(d.brandName) };
    brandId = b.id;
    if (b.created) created = d.brandName;
  }
  if (!brandId) {
    // A record that never had a sponsor may stay that way; one that has a sponsor cannot lose it.
    if (cur.brand_id) return { ok: false, error: 'Choose the sponsor, or type its name.' };
  }
  const patch: Record<string, unknown> = {
    creator_id: d.creatorId, brand_id: brandId, sponsored_on: d.date,
    video_url: cleanVideoUrl(d.videoUrl) || null, video_title: d.videoTitle || null,
  };
  if (cur.source_label === 'confirmed') patch.evidence_note = d.note || null; // detected records have no "how do you know"
  const { data: rows, error } = await supabase.from('sponsorships').update(patch).eq('id', d.id).select('id');
  if (error) return { ok: false, error: plainError(error) };
  if (!rows?.length) return { ok: false, error: GONE };
  refresh([cur.creator_id, d.creatorId], [cur.brand_id, brandId]);
  return { ok: true, message: created ? `Record updated. “${created}” was added as a new sponsor.` : 'Record updated.', brandCreated: created };
}

/** Detected -> Confirmed. The note ("how did you check it") is required here and by the database. */
export async function confirmSponsorship(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = confirmSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from('sponsorships')
    .update({ source_label: 'confirmed', evidence_note: p.data.note }).eq('id', p.data.id).eq('source_label', 'detected').select('creator_id, brand_id');
  if (error) return { ok: false, error: plainError(error) };
  if (!data?.length) return { ok: false, error: 'This record changed while you looked at it. Refresh the page.' };
  refresh([data[0].creator_id], [data[0].brand_id]);
  return { ok: true, message: 'Record confirmed. It can now be used in pitches and counts in filters.' };
}

/** Reject: the record is kept and hidden, so it is not detected again. */
export async function rejectSponsorship(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = idSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from('sponsorships').update({ rejected: true }).eq('id', p.data.id).select('creator_id, brand_id');
  if (error) return { ok: false, error: plainError(error) };
  if (!data?.length) return { ok: false, error: GONE };
  refresh([data[0].creator_id], [data[0].brand_id]);
  return { ok: true, message: 'Record rejected. It is hidden and will not be detected again.' };
}

export async function restoreSponsorship(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = idSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from('sponsorships').update({ rejected: false }).eq('id', p.data.id).select('creator_id, brand_id');
  if (error) return { ok: false, error: plainError(error) };
  if (!data?.length) return { ok: false, error: GONE };
  refresh([data[0].creator_id], [data[0].brand_id]);
  return { ok: true, message: 'Record restored.' };
}

/** The pick list of the form: sponsors for a creator's history, creators for a sponsor's. Loaded when the form opens. */
export async function listParties(side: unknown): Promise<PartyOption[]> {
  await requireStaff();
  const s = sideSchema.safeParse(side);
  if (!s.success) return [];
  const supabase = await createClient();
  if ((s.data as SponsorshipSide) === 'creator') {
    const { data } = await supabase.from('brands').select('id, name').order('name').limit(2000);
    return (data ?? []).map((b) => ({ id: b.id as string, label: b.name as string }));
  }
  const { data } = await supabase.from('creators').select('id, full_name, channel_name').order('full_name').limit(2000);
  return (data ?? []).map((c) => ({ id: c.id as string, label: c.channel_name ? `${c.full_name} (${c.channel_name})` : (c.full_name as string) }));
}
