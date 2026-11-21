'use server';
// Staff can add deals and change their stage. Only the owner can delete. Every action checks the role
// on the server and validates its input with zod before touching the database (through the user's own client, so RLS applies).
// Commission is set by the database trigger; it is never computed or sent from here.
import { revalidatePath } from 'next/cache';
import { requireOwner, requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { addDealSchema, deleteDealSchema, updateStageSchema } from '@/lib/deals/schemas';

export type DealFormState = { error?: string; ok?: string; fieldErrors?: Record<string, string> };

function refresh() {
  revalidatePath('/deals');
  revalidatePath('/overview');
}

/** Finds a brand by name (the column is citext, so the match ignores case) or creates it. */
async function findOrCreateBrand(supabase: Awaited<ReturnType<typeof createClient>>, name: string): Promise<string | null> {
  const { data: found } = await supabase.from('brands').select('id').eq('name', name).maybeSingle();
  if (found) return found.id as string;
  const { data: created, error } = await supabase.from('brands').insert({ name }).select('id').single();
  if (!error && created) return created.id as string;
  // Someone may have created the same name a moment ago.
  const { data: again } = await supabase.from('brands').select('id').eq('name', name).maybeSingle();
  return (again?.id as string | undefined) ?? null;
}

export async function addDealAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await requireStaff();
  const parsed = addDealSchema.safeParse({
    creator_id: formData.get('creator_id'),
    brand_name: formData.get('brand_name'),
    stage: formData.get('stage'),
    amount: formData.get('amount'),
  });
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .map(([k, v]) => [k, (v as string[] | undefined)?.[0] ?? ''])
        .filter(([, v]) => v),
    );
    return { error: 'Check the highlighted fields.', fieldErrors };
  }
  const { creator_id, brand_name, stage, amount } = parsed.data;

  const supabase = await createClient();
  const brandId = await findOrCreateBrand(supabase, brand_name);
  if (!brandId) return { error: 'Could not save the brand name. Try again.' };

  const { error } = await supabase.from('deals').insert({ creator_id, brand_id: brandId, stage, amount_cents: amount });
  if (error) return { error: 'Could not add the deal. Check the creator and try again.' };

  refresh();
  return { ok: `Deal with ${brand_name} added.` };
}

export async function updateStageAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await requireStaff();
  const parsed = updateStageSchema.safeParse({ id: formData.get('id'), stage: formData.get('stage') });
  if (!parsed.success) return { error: 'Pick a valid stage.' };

  const supabase = await createClient();
  const { error } = await supabase.from('deals').update({ stage: parsed.data.stage }).eq('id', parsed.data.id);
  if (error) return { error: 'Could not change the stage. Try again.' };

  refresh();
  return {};
}

export async function deleteDealAction(formData: FormData): Promise<void> {
  await requireOwner();
  const parsed = deleteDealSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase.from('deals').delete().eq('id', parsed.data.id);
  if (error) return;

  refresh();
}
