'use server';
// Add / edit a creator (owner and worker). Validation runs here on the server; the form only shows what comes back.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { validateCreator, type CreatorField } from '@/lib/creators/schema';

export type SaveState = { errors?: Partial<Record<CreatorField, string>>; error?: string; values?: Record<string, string> } | null;

const FIELDS: CreatorField[] = ['name', 'email', 'phone', 'channel_url', 'niche', 'subscribers', 'status', 'notes'];
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export async function saveCreator(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStaff();
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f] = str(formData.get(f));

  const id = str(formData.get('id'));
  if (id && !z.string().uuid().safeParse(id).success) return { error: 'Creator not found.', values };
  const back = str(formData.get('back'));
  const backQuery = /^\?[\w=&%.+\-]*$/.test(back) ? back : '';

  const v = validateCreator(values);
  if (!v.ok) return { errors: v.errors, values };

  const supabase = await createClient();
  let savedId = id;
  if (id) {
    const { data: current, error: readErr } = await supabase.from('creators').select('channel_url').eq('id', id).maybeSingle();
    if (readErr || !current) return { error: 'Creator not found.', values };
    const changedLink = (current.channel_url ?? null) !== v.data.channel_url;
    const patch = changedLink ? { ...v.data, youtube_channel_id: null } : v.data;
    const { error } = await supabase.from('creators').update(patch).eq('id', id);
    if (error) return dbError(error.code, values);
  } else {
    const { data, error } = await supabase.from('creators').insert(v.data).select('id').single();
    if (error || !data) return dbError(error?.code, values);
    savedId = data.id;
  }
  const sp = new URLSearchParams(backQuery.slice(1));
  sp.delete('new'); sp.delete('edit'); sp.set('creator', savedId);
  redirect(`/creators?${sp.toString()}`);
}

function dbError(code: string | undefined, values: Record<string, string>): SaveState {
  if (code === '23505') return { errors: { email: 'A creator with this email already exists.' }, values };
  return { error: 'Could not save. Please try again.', values };
}

