'use server';
// Server actions of Sponsors: add / edit a sponsor, contact people, notes, bulk tag, saved views, delete.
// Every action checks the login and the role first, checks the input with zod-style validators, and uses the user's own
// Supabase client so row-level security is the second line. Messages are plain English.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { MAX_BULK } from '@/lib/sponsors/constants';
import { viewQuery } from '@/lib/sponsors/filters';
import { validateContact, validateSponsor, type ContactField, type SponsorField } from '@/lib/sponsors/schema';

export type FormState = {
  ok?: boolean;
  error?: string;
  errors?: Partial<Record<SponsorField | ContactField, string>>;
  values?: Record<string, string | string[]>;
} | null;
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const guid = z.guid();
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const SPONSOR_FIELDS = ['name', 'website', 'industry', 'country', 'company_size', 'target_min_subs', 'target_max_subs', 'budget_min', 'budget_max', 'relationship', 'notes'];
const CONTACT_FIELDS = ['full_name', 'role_title', 'email', 'phone', 'linkedin_url'];
const OWNER_ONLY = 'Only the owner can do this.';

type DbError = { code?: string; message?: string } | null;

// ---------------------------------------------------------------- sponsor

export async function saveSponsor(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const values: Record<string, string | string[]> = {};
  for (const f of SPONSOR_FIELDS) values[f] = str(formData.get(f));
  values.niches = formData.getAll('niches').filter((v): v is string => typeof v === 'string');
  const id = str(formData.get('id'));
  if (id && !guid.safeParse(id).success) return { error: 'Sponsor not found.', values };

  const v = validateSponsor(values);
  if (!v.ok) return { errors: v.errors, values };

  const supabase = await createClient();
  let savedId = id;
  if (id) {
    const { data, error } = await supabase.from('brands').update(v.data).eq('id', id).select('id');
    if (error) return sponsorDbError(error, values);
    if (!data?.length) return { error: 'This sponsor no longer exists.', values };
  } else {
    const { data, error } = await supabase.from('brands').insert(v.data).select('id').single();
    if (error || !data) return sponsorDbError(error, values);
    savedId = data.id;
  }
  if (!id) redirect(`/sponsors?open=${savedId}`);
  return { ok: true };
}

function sponsorDbError(error: DbError, values: Record<string, string | string[]>): FormState {
  if (error?.code === '23505') return { errors: { name: 'A sponsor with this name already exists.' }, values };
  if (error?.code === '23514') return { error: 'One of the values is outside what is allowed. Check the sizes and budgets.', values };
  return { error: 'Could not save. Please try again.', values };
}

export async function deleteSponsor(id: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== 'owner') return { ok: false, error: OWNER_ONLY };
  if (!guid.safeParse(id).success) return { ok: false, error: 'Sponsor not found.' };
  const supabase = await createClient();
  const [deals, records] = await Promise.all([
    supabase.from('deals').select('id', { count: 'exact', head: true }).eq('brand_id', id),
    supabase.from('sponsorships').select('id', { count: 'exact', head: true }).eq('brand_id', id),
  ]);
  if (deals.error || records.error) return { ok: false, error: 'Could not check this sponsor. Please try again.' };
  const d = deals.count ?? 0;
  const r = records.count ?? 0;
  if (d > 0 || r > 0) {
    const parts = [d ? `${d} deal${d === 1 ? '' : 's'}` : '', r ? `${r} sponsorship record${r === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
    return { ok: false, error: `This sponsor has ${parts}, so it cannot be deleted. Remove or move them first.` };
  }
  const { data, error } = await supabase.from('brands').delete().eq('id', id).select('id');
  if (error) {
    return { ok: false, error: error.code === '23503' ? 'This sponsor is still used by a deal or a sponsorship record, so it cannot be deleted.' : 'Could not delete. Please try again.' };
  }
  if (!data?.length) return { ok: false, error: 'This sponsor no longer exists.' };
  redirect('/sponsors');
}

export async function saveNotes(id: string, notes: string): Promise<ActionResult> {
  await requireStaff();
  if (!guid.safeParse(id).success) return { ok: false, error: 'Sponsor not found.' };
  if (typeof notes !== 'string' || notes.length > 5000) return { ok: false, error: 'Notes can be up to 5,000 characters.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('brands').update({ notes: notes.trim() === '' ? null : notes.trim() }).eq('id', id).select('id');
  if (error) return { ok: false, error: 'Could not save the notes. Please try again.' };
  if (!data?.length) return { ok: false, error: 'This sponsor no longer exists.' };
  return { ok: true, message: 'Notes saved.' };
}

// ---------------------------------------------------------------- contact people

export async function saveContact(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const values: Record<string, string | string[]> = {};
  for (const f of CONTACT_FIELDS) values[f] = str(formData.get(f));
  values.is_primary = formData.get('is_primary') ? '1' : '';
  const brandId = str(formData.get('brand_id'));
  const id = str(formData.get('id'));
  if (!guid.safeParse(brandId).success || (id && !guid.safeParse(id).success)) return { error: 'Contact person not found.', values };
  const v = validateContact(values);
  if (!v.ok) return { errors: v.errors, values };

  const supabase = await createClient();
  let primary = values.is_primary === '1';
  if (!id && !primary) {
    // The first person added becomes the main contact.
    const { count } = await supabase.from('brand_contacts').select('id', { count: 'exact', head: true }).eq('brand_id', brandId);
    if (count === 0) primary = true;
  }
  if (id) {
    const patch: Record<string, unknown> = { ...v.data };
    if (primary) patch.is_primary = true;
    else if (formData.get('was_primary') === '1') patch.is_primary = false;
    const { data, error } = await supabase.from('brand_contacts').update(patch).eq('id', id).eq('brand_id', brandId).select('id');
    if (error) return contactDbError(error, values);
    if (!data?.length) return { error: 'This person no longer exists.', values };
  } else {
    const { error } = await supabase.from('brand_contacts').insert({ ...v.data, brand_id: brandId, is_primary: primary });
    if (error) return contactDbError(error, values);
  }
  return { ok: true };
}

function contactDbError(error: DbError, values: Record<string, string | string[]>): FormState {
  if (error?.code === '23505') return { errors: { email: 'This sponsor already has a person with this email.' }, values };
  if (error?.code === '23503') return { error: 'This sponsor no longer exists.', values };
  return { error: 'Could not save. Please try again.', values };
}

export async function setMainContact(id: string): Promise<ActionResult> {
  await requireStaff();
  if (!guid.safeParse(id).success) return { ok: false, error: 'Contact person not found.' };
  const supabase = await createClient();
  // The database un-marks the previous main contact (one per sponsor).
  const { data, error } = await supabase.from('brand_contacts').update({ is_primary: true }).eq('id', id).select('id');
  if (error || !data?.length) return { ok: false, error: 'Could not change the main contact.' };
  return { ok: true, message: 'Main contact changed.' };
}

export async function deleteContact(id: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (staff.role !== 'owner') return { ok: false, error: OWNER_ONLY };
  if (!guid.safeParse(id).success) return { ok: false, error: 'Contact person not found.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('brand_contacts').delete().eq('id', id).select('id');
  if (error || !data?.length) return { ok: false, error: 'Could not delete this person.' };
  return { ok: true, message: 'Person removed.' };
}

// ---------------------------------------------------------------- tags and saved views

export async function addTagToSponsors(ids: string[], rawName: string): Promise<ActionResult> {
  await requireStaff();
  const list = Array.isArray(ids) ? Array.from(new Set(ids)) : [];
  if (list.length === 0 || list.length > MAX_BULK || !list.every((i) => guid.safeParse(i).success)) return { ok: false, error: `Choose between 1 and ${MAX_BULK} sponsors.` };
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > 60) return { ok: false, error: 'Enter a tag name of up to 60 characters.' };
  const supabase = await createClient();
  let tagId: string | null = null;
  const found = await supabase.from('tags').select('id, name').eq('scope', 'brand').eq('name', name).maybeSingle();
  if (found.error) return { ok: false, error: 'Could not add the tag. Please try again.' };
  if (found.data) tagId = found.data.id;
  else {
    const made = await supabase.from('tags').insert({ name, scope: 'brand' }).select('id').single();
    if (made.error || !made.data) return { ok: false, error: 'Could not add the tag. Please try again.' };
    tagId = made.data.id;
  }
  const { error } = await supabase.from('brand_tags').upsert(list.map((brand_id) => ({ brand_id, tag_id: tagId })), { onConflict: 'brand_id,tag_id', ignoreDuplicates: true });
  if (error) return { ok: false, error: 'Could not add the tag. Please try again.' };
  return { ok: true, message: `Tag "${name}" added to ${list.length} sponsor${list.length === 1 ? '' : 's'}.` };
}

export async function saveView(name: string, query: string, shared: boolean): Promise<ActionResult> {
  await requireStaff();
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n || n.length > 100) return { ok: false, error: 'Give the view a name of up to 100 characters.' };
  const q = viewQuery(typeof query === 'string' ? query.slice(0, 2000) : '');
  const supabase = await createClient();
  const { error } = await supabase.from('saved_views').insert({ scope: 'sponsors', name: n, query: q, is_shared: shared === true });
  if (error) return { ok: false, error: error.code === '23505' ? 'You already have a view with this name.' : 'Could not save the view. Please try again.' };
  return { ok: true, message: `View "${n}" saved.` };
}

export async function deleteView(id: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!guid.safeParse(id).success) return { ok: false, error: 'View not found.' };
  const supabase = await createClient();
  // Own views only, even for the owner role: someone else's view is theirs to remove.
  const { data, error } = await supabase.from('saved_views').delete().eq('id', id).eq('owner_id', staff.id).select('id');
  if (error || !data?.length) return { ok: false, error: 'Could not delete this view.' };
  return { ok: true, message: 'View deleted.' };
}
