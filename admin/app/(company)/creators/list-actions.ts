'use server';
// Server actions of the Creators list: bulk "add to a list" / "add a tag" and saved views.
// Every action checks the login (staff), validates with zod, takes at most 200 creators, and runs as the person
// (their Supabase client), so row level security and the database rules always apply.
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { cleanQuery } from '@/lib/creators/filters';
import { MAX_BULK_IDS } from '@/lib/creators/constants';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message: string; id?: string } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });
const GENERIC = 'That did not work. Please try again.';

const ids = z.array(z.guid()).min(1, 'Tick at least one creator.').max(MAX_BULK_IDS, `Pick at most ${MAX_BULK_IDS} creators at a time.`);
const newName = z.string().trim().min(1, 'Give it a name.').max(60, 'Use 60 characters or fewer.');

const listInput = z.object({ ids, listId: z.guid().optional(), newName: newName.optional() })
  .refine((v) => !!v.listId !== !!v.newName, 'Pick a list or type a new name.');
const tagInput = z.object({ ids, tagId: z.guid().optional(), newName: newName.optional() })
  .refine((v) => !!v.tagId !== !!v.newName, 'Pick a tag or type a new name.');

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export async function addToList(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = listInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? GENERIC);
  const supabase = await createClient();
  const unique = [...new Set(p.data.ids)];
  let listId = p.data.listId;
  let name = '';
  if (p.data.newName) {
    const { data, error } = await supabase.from('lists').insert({ name: p.data.newName, kind: 'creators' }).select('id, name').single();
    if (error?.code === '23505') {
      // A list with this name exists already: use it.
      const { data: same } = await supabase.from('lists').select('id, name').eq('kind', 'creators').eq('name', p.data.newName).maybeSingle();
      if (!same) return fail(GENERIC);
      listId = same.id; name = same.name;
    } else if (error || !data) {
      console.error('creators: list create failed', error?.code);
      return fail(GENERIC);
    } else { listId = data.id; name = data.name; }
  } else {
    const { data: l } = await supabase.from('lists').select('id, name').eq('id', listId!).eq('kind', 'creators').maybeSingle();
    if (!l) return fail('That list no longer exists.');
    name = l.name;
  }
  const { data: added, error } = await supabase.rpc('creators_add_to_list', { p_list: listId, p_ids: unique });
  if (error) { console.error('creators: add to list failed', error.code); return fail(GENERIC); }
  const n = Number(added ?? 0);
  const already = unique.length - n;
  return { ok: true, id: listId, message: `Added ${plural(n, 'creator')} to "${name}".${already > 0 ? ` ${already} ${already === 1 ? 'was' : 'were'} already on it.` : ''}` };
}

export async function addTag(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const p = tagInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? GENERIC);
  const supabase = await createClient();
  const unique = [...new Set(p.data.ids)];
  let tagId = p.data.tagId;
  let name = '';
  if (p.data.newName) {
    const { data, error } = await supabase.from('tags').insert({ name: p.data.newName, scope: 'creator' }).select('id, name').single();
    if (error?.code === '23505') {
      const { data: same } = await supabase.from('tags').select('id, name').eq('scope', 'creator').eq('name', p.data.newName).maybeSingle();
      if (!same) return fail(GENERIC);
      tagId = same.id; name = same.name;
    } else if (error || !data) {
      console.error('creators: tag create failed', error?.code);
      return fail(GENERIC);
    } else { tagId = data.id; name = data.name; }
  } else {
    const { data: t } = await supabase.from('tags').select('id, name').eq('id', tagId!).eq('scope', 'creator').maybeSingle();
    if (!t) return fail('That tag no longer exists.');
    name = t.name;
  }
  const { data: added, error } = await supabase.rpc('creators_add_tag', { p_tag: tagId, p_ids: unique });
  if (error) { console.error('creators: add tag failed', error.code); return fail(GENERIC); }
  const n = Number(added ?? 0);
  const already = unique.length - n;
  return { ok: true, id: tagId, message: `Tagged ${plural(n, 'creator')} "${name}".${already > 0 ? ` ${already} already had it.` : ''}` };
}

// ---------------------------------------------------------------- saved views
const viewInput = z.object({
  name: z.string().trim().min(1, 'Give the view a name.').max(100, 'Use 100 characters or fewer.'),
  query: z.string().max(2000),
  shared: z.boolean().optional(),
});

export async function saveView(input: unknown): Promise<ActionResult> {
  const staff = await requireStaff();
  const p = viewInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? GENERIC);
  // Only filters, sort and view are stored (never page or the open panel), and only values that parse.
  const query = cleanQuery(p.data.query);
  const supabase = await createClient();
  const { data, error } = await supabase.from('saved_views')
    .insert({ owner_id: staff.id, scope: 'creators', name: p.data.name, query, is_shared: !!p.data.shared })
    .select('id').single();
  if (error?.code === '23505') return fail('You already have a view with that name.');
  if (error || !data) { console.error('creators: save view failed', error?.code); return fail(GENERIC); }
  return { ok: true, id: data.id, message: `Saved "${p.data.name}".` };
}

export async function deleteView(id: unknown): Promise<ActionResult> {
  const staff = await requireStaff();
  const p = z.guid().safeParse(id);
  if (!p.success) return fail(GENERIC);
  const supabase = await createClient();
  // Only your own (the owner role may delete any, but this screen only offers your own).
  const { data, error } = await supabase.from('saved_views').delete().eq('id', p.data).eq('owner_id', staff.id).eq('scope', 'creators').select('id');
  if (error) { console.error('creators: delete view failed', error.code); return fail(GENERIC); }
  if (!data?.length) return fail('That view no longer exists.');
  return { ok: true, message: 'View deleted.' };
}
