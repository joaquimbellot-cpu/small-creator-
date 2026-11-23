'use server';
// Add / edit a creator (owner and worker). Validation runs here on the server; the form only shows what comes back.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { channelKey, parseChannelUrl } from '@/lib/youtube/channel';
import { validateCreator, type CreatorField } from '@/lib/creators/schema';

export type SaveState = { errors?: Partial<Record<CreatorField, string>>; error?: string; values?: Record<string, string> } | null;

const FIELDS: CreatorField[] = ['name', 'email', 'phone', 'channel_url', 'niche', 'subscribers', 'status', 'notes'];
const NO_YT_ID = '-'; // matches no stored channel id
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export async function saveCreator(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff();
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f] = str(formData.get(f));

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
    const { data: current, error: readErr } = await supabase.from('creators').select('channel_url').eq('id', id).maybeSingle();
    if (readErr || !current) return { error: 'Creator not found.', values };
    const changedLink = (current.channel_url ?? null) !== v.data.channel_url;
    const patch = changedLink ? { ...v.data, youtube_channel_id: null } : v.data;
    const { error } = await supabase.from('creators').update(patch).eq('id', id);
    if (error) return dbError(error, values);
  } else {
    const { data, error } = await supabase.from('creators').insert(v.data).select('id').single();
    if (error || !data) return dbError(error, values);
    savedId = data.id;
  }
  const sp = new URLSearchParams(backQuery.slice(1));
  sp.delete('new'); sp.delete('edit'); sp.set('creator', savedId);
  redirect(`/creators?${sp.toString()}`);
}

function dbError(error: { code?: string; message?: string } | null, values: Record<string, string>): SaveState {
  if (error?.code === '23505') return { errors: { email: 'A creator with this email already exists.' }, values };
  // The database rule: only the owner can take a creator off do not contact.
  if (error?.code === '23514' && /do not contact/i.test(error.message ?? '')) {
    return { errors: { status: 'Only the owner can take a creator off Do not contact.' }, values };
  }
  return { error: 'Could not save. Please try again.', values };
}
