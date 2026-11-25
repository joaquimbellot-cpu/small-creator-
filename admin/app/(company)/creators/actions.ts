'use server';
// Add / edit a creator (owner and worker). Validation runs here on the server; the form only shows what comes back.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { channelKey, parseChannelUrl } from '@/lib/youtube/channel';
import { validateCreator, type CreatorField } from '@/lib/creators/schema';

export type SaveState = { errors?: Partial<Record<CreatorField, string>>; error?: string; values?: Record<string, string> } | null;

const FIELDS: CreatorField[] = ['name', 'email', 'phone', 'channel_url', 'niche', 'subscribers', 'status', 'notes',
  'niche_slug', 'country', 'language', 'avg_views', 'engagement_rate', 'audience_countries', 'uploads_per_month'];
const NO_YT_ID = '-'; // matches no stored channel id
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export async function saveCreator(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff();
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f] = str(formData.get(f));
  // The country select has an "Other" choice with its own 2-letter box.
  if (values.country === 'other') values.country = str(formData.get('country_other'));

  const id = str(formData.get('id'));
  if (id && !z.guid().safeParse(id).success) return { error: 'Creator not found.', values };
  const back = str(formData.get('back'));
  const backQuery = /^\?[\w=&%.+-]*$/.test(back) ? back : '';

  const v = validateCreator(values);
  if (!v.ok) return { errors: v.errors, values };

  const supabase = await createClient();
  // The same channel must not be listed twice (the CSV import checks this too). Narrow by the channel name, then compare keys.
  const ref = v.data.channel_url ? parseChannelUrl(v.data.channel_url) : null;
  const ckey = channelKey(v.data.channel_url);
  if (ref && ckey) {
    const needle = ref.value.replace(/[\\%_]/g, (c) => `\\${c}`);
    let q = supabase.from('creators').select('channel_url, youtube_channel_id').or(`channel_url.ilike.%${needle}%,youtube_channel_id.eq.${ref.kind === 'id' ? ref.value : NO_YT_ID}`);
    if (id) q = q.neq('id', id);
    const { data: same, error: chErr } = await q;
    if (chErr) return { error: 'Could not save. Please try again.', values };
    const taken = (same ?? []).some((r) => channelKey(r.channel_url) === ckey || (r.youtube_channel_id && `id:${r.youtube_channel_id}` === ckey));
    if (taken) return { errors: { channel_url: 'This channel is already in Smallfold.' }, values };
  }
  let savedId = id;
  if (id) {
    const { data: current, error: readErr } = await supabase.from('creators').select('channel_url, avg_views').eq('id', id).maybeSingle();
    if (readErr || !current) return { error: 'Creator not found.', values };
    const changedLink = (current.channel_url ?? null) !== v.data.channel_url;
    // New average views count as checked now.
    // A form that did not know the new fields (profile_fields not sent) must not blank them.
    const withProfile = str(formData.get('profile_fields')) === '1';
    const viewsChanged = withProfile && (current.avg_views ?? null) !== v.data.avg_views;
    const base = withProfile ? v.data : stripProfileFields(v.data);
    const patch = {
      ...base,
      ...(changedLink ? { youtube_channel_id: null } : {}),
      ...(viewsChanged ? { avg_views_checked_at: v.data.avg_views == null ? null : new Date().toISOString() } : {}),
    };
    const { error } = await supabase.from('creators').update(patch).eq('id', id);
    if (error) return dbError(error, values);
  } else {
    const { data, error } = await supabase.from('creators')
      .insert({ ...v.data, ...(v.data.avg_views != null ? { avg_views_checked_at: new Date().toISOString() } : {}) }).select('id').single();
    if (error || !data) return dbError(error, values);
    savedId = data.id;
  }
  const sp = new URLSearchParams(backQuery.slice(1));
  sp.delete('new'); sp.delete('edit'); sp.set('creator', savedId);
  redirect(`/creators?${sp.toString()}`);
}

const PROFILE_KEYS = ['niche_slug', 'country', 'language', 'avg_views', 'engagement_rate', 'audience_countries', 'uploads_per_month'] as const;
function stripProfileFields<T extends Record<string, unknown>>(d: T): Partial<T> {
  const copy: Record<string, unknown> = { ...d };
  for (const k of PROFILE_KEYS) delete copy[k];
  return copy as Partial<T>;
}

/** Edit form helper: the seven optional fields of one creator, as text, for a form that was opened without them. No contact details, so no audit line. */
export async function loadProfileFields(id: string): Promise<Record<string, string> | null> {
  await requireStaff();
  if (!z.guid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('creators')
    .select('niche_slug, country, language, avg_views, engagement_rate, audience_countries, uploads_per_month').eq('id', id).maybeSingle();
  if (!data) return null;
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, data[k] == null ? '' : String(data[k])]));
}

function dbError(error: { code?: string; message?: string } | null, values: Record<string, string>): SaveState {
  if (error?.code === '23505') return { errors: { email: 'A creator with this email already exists.' }, values };
  // The database rule: only the owner can take a creator off do not contact.
  if (error?.code === '23514' && /do not contact/i.test(error.message ?? '')) {
    return { errors: { status: 'Only the owner can take a creator off Do not contact.' }, values };
  }
  return { error: 'Could not save. Please try again.', values };
}
