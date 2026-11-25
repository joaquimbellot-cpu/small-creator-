'use server';
// Tags on one sponsor (scope "brand"): add and remove. Staff only; input checked with zod; the user's own Supabase client,
// so row security applies. Same rules as the creator profile's tags.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';

export type TagResult = { ok: true; message: string; tag?: { id: string; name: string } } | { ok: false; error: string };

const id = z.guid();
const tagName = z.string().trim().min(1, 'Type a tag name.').max(60, 'A tag can have 60 characters at most.');

function refresh(brandId: string) {
  revalidatePath(`/sponsors/${brandId}`);
  revalidatePath('/sponsors');
}

export async function addSponsorTag(brandId: unknown, name: unknown): Promise<TagResult> {
  await requireStaff();
  const b = id.safeParse(brandId), n = tagName.safeParse(name);
  if (!b.success) return { ok: false, error: 'This sponsor no longer exists.' };
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  let { data: tag } = await supabase.from('tags').select('id, name').eq('scope', 'brand').eq('name', n.data).maybeSingle();
  if (!tag) {
    const ins = await supabase.from('tags').insert({ name: n.data, scope: 'brand' }).select('id, name').single();
    if (ins.error) {
      // Someone made the same tag a moment ago: use theirs.
      const again = await supabase.from('tags').select('id, name').eq('scope', 'brand').eq('name', n.data).maybeSingle();
      tag = again.data;
    } else tag = ins.data;
  }
  if (!tag) return { ok: false, error: 'Could not save the tag. Try again.' };
  const { error } = await supabase.from('brand_tags').insert({ brand_id: b.data, tag_id: tag.id });
  if (error && error.code !== '23505') return { ok: false, error: error.code === '23503' ? 'This sponsor no longer exists.' : 'Could not add the tag. Try again.' };
  refresh(b.data);
  return { ok: true, message: error ? 'That tag is already on this sponsor.' : `Tag “${tag.name}” added.`, tag: { id: tag.id as string, name: String(tag.name) } };
}

export async function removeSponsorTag(brandId: unknown, tagId: unknown): Promise<TagResult> {
  await requireStaff();
  const b = id.safeParse(brandId), t = id.safeParse(tagId);
  if (!b.success || !t.success) return { ok: false, error: 'This tag no longer exists.' };
  const supabase = await createClient();
  const { error } = await supabase.from('brand_tags').delete().eq('brand_id', b.data).eq('tag_id', t.data);
  if (error) return { ok: false, error: 'Could not remove the tag. Try again.' };
  refresh(b.data);
  return { ok: true, message: 'Tag removed.' };
}
