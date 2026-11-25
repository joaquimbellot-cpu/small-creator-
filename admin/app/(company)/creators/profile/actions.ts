'use server';
// Actions of the creator profile: tags, notes, and a refresh after the subscriber check. Staff only; input checked with zod;
// the user's own Supabase client, so row security applies. Notes are personal data: they are never written to the audit log
// (the database trigger stores {"changed": true} for them).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';

export type ProfileResult = { ok: true; message: string; tag?: { id: string; name: string } } | { ok: false; error: string };

const id = z.guid();
const tagName = z.string().trim().min(1, 'Type a tag name.').max(60, 'A tag can have 60 characters at most.');
const notes = z.string().max(2000, 'Notes must be 2000 characters or fewer.');

function refresh(creatorId: string) {
  revalidatePath(`/creators/${creatorId}`);
  revalidatePath('/creators');
}

export async function addCreatorTag(creatorId: unknown, name: unknown): Promise<ProfileResult> {
  await requireStaff();
  const c = id.safeParse(creatorId), n = tagName.safeParse(name);
  if (!c.success) return { ok: false, error: 'This creator no longer exists.' };
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  let { data: tag } = await supabase.from('tags').select('id, name').eq('scope', 'creator').eq('name', n.data).maybeSingle();
  if (!tag) {
    const ins = await supabase.from('tags').insert({ name: n.data, scope: 'creator' }).select('id, name').single();
    if (ins.error) {
      const again = await supabase.from('tags').select('id, name').eq('scope', 'creator').eq('name', n.data).maybeSingle(); // made a moment ago
      tag = again.data;
    } else tag = ins.data;
  }
  if (!tag) return { ok: false, error: 'Could not save the tag. Try again.' };
  const { error } = await supabase.from('creator_tags').insert({ creator_id: c.data, tag_id: tag.id });
  if (error && error.code !== '23505') return { ok: false, error: error.code === '23503' ? 'This creator no longer exists.' : 'Could not add the tag. Try again.' };
  refresh(c.data);
  return { ok: true, message: error ? 'That tag is already on this creator.' : `Tag “${tag.name}” added.`, tag: { id: tag.id as string, name: String(tag.name) } };
}

export async function removeCreatorTag(creatorId: unknown, tagId: unknown): Promise<ProfileResult> {
  await requireStaff();
  const c = id.safeParse(creatorId), t = id.safeParse(tagId);
  if (!c.success || !t.success) return { ok: false, error: 'This tag no longer exists.' };
  const supabase = await createClient();
  const { error } = await supabase.from('creator_tags').delete().eq('creator_id', c.data).eq('tag_id', t.data);
  if (error) return { ok: false, error: 'Could not remove the tag. Try again.' };
  refresh(c.data);
  return { ok: true, message: 'Tag removed.' };
}

export async function saveCreatorNotes(creatorId: unknown, text: unknown): Promise<ProfileResult> {
  await requireStaff();
  const c = id.safeParse(creatorId), n = notes.safeParse(text);
  if (!c.success) return { ok: false, error: 'This creator no longer exists.' };
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from('creators').update({ notes: n.data.trim() || null }).eq('id', c.data).select('id');
  if (error) return { ok: false, error: 'Could not save the notes. Try again.' };
  if (!data?.length) return { ok: false, error: 'This creator no longer exists.' };
  refresh(c.data);
  return { ok: true, message: 'Notes saved.' };
}

/** After the subscriber check (a separate API call): show the new numbers. A server action, so the profile view is not logged again. */
export async function refreshCreatorView(creatorId: unknown): Promise<void> {
  await requireStaff();
  const c = id.safeParse(creatorId);
  if (c.success) refresh(c.data);
}
