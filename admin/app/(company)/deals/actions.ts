'use server';
// Staff can add deals and change their stage. Only the owner can delete. Every action checks the role
// on the server and validates its input with zod before touching the database (through the user's own client, so RLS applies).
// Commission is set by the database trigger; it is never computed or sent from here. Moving a deal to Completed or Paid makes
// the database add a Confirmed sponsorship record (trigger trg_deal_sponsorship); the actions say so when that happened.
import { revalidatePath } from 'next/cache';
import { requireOwner, requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { STAGE_LABEL, formatUsd, type Stage } from '@/lib/deals/format';
import { addDealSchema, deleteDealSchema, moveDealSchema, updateAmountSchema, updateStageSchema } from '@/lib/deals/schemas';

export type DealFormState = { error?: string; ok?: string; fieldErrors?: Record<string, string> };

const GONE = 'This deal no longer exists. Refresh the page.';

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
    amount: formData.get('amount') ?? '',
  });
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .map(([k, v]) => [k, (v as string[] | undefined)?.[0] ?? ''])
        .filter(([, v]) => v),
    );
    return { error: 'Check the highlighted fields.', fieldErrors };
  }
  const { creator_id, brand_name, stage, amount } = parsed.data; // amount: whole cents, or null when left empty

  const supabase = await createClient();
  const brandId = await findOrCreateBrand(supabase, brand_name);
  if (!brandId) return { error: 'Could not save the brand name. Try again.' };

  const { error } = await supabase.from('deals').insert({ creator_id, brand_id: brandId, stage, amount_cents: amount });
  if (error) return { error: 'Could not add the deal. Check the creator and try again.' };

  refresh();
  return { ok: `Deal with ${brand_name} added.` };
}

type Db = Awaited<ReturnType<typeof createClient>>;
const COMPLETE: Stage[] = ['completed', 'paid'];

/** Changes the stage. Says whether the database added a Confirmed sponsorship record for it (only the first time a deal completes). */
async function changeStage(supabase: Db, id: string, stage: Stage): Promise<{ ok: true; from: Stage; recordAdded: boolean } | { ok: false; error: string }> {
  const { data: before } = await supabase.from('deals').select('stage').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: GONE };
  const had = COMPLETE.includes(stage)
    ? ((await supabase.from('sponsorships').select('id', { count: 'exact', head: true }).eq('deal_id', id)).count ?? 0) > 0
    : true;
  const { data, error } = await supabase.from('deals').update({ stage }).eq('id', id).select('id');
  if (error) return { ok: false, error: 'Could not change the stage. Try again.' };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  refresh();
  if (COMPLETE.includes(stage)) { revalidatePath('/creators'); revalidatePath('/sponsors'); }
  return { ok: true, from: before.stage as Stage, recordAdded: COMPLETE.includes(stage) && !had };
}

const RECORD_NOTE = ' A Confirmed sponsorship was added to both histories.';

export async function updateStageAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await requireStaff();
  const parsed = updateStageSchema.safeParse({ id: formData.get('id'), stage: formData.get('stage') });
  if (!parsed.success) return { error: 'Pick a valid stage.' };

  const r = await changeStage(await createClient(), parsed.data.id, parsed.data.stage);
  if (!r.ok) return { error: r.error };
  return { ok: `Saved.${r.recordAdded ? RECORD_NOTE : ''}` };
}

export type MoveResult = { ok: true; message: string } | { ok: false; error: string };

/** The board's "Move to" menu and drag and drop. */
export async function moveDealAction(input: unknown): Promise<MoveResult> {
  await requireStaff();
  const parsed = moveDealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Pick a valid stage.' };
  const r = await changeStage(await createClient(), parsed.data.id, parsed.data.stage);
  if (!r.ok) return r;
  if (r.from === parsed.data.stage) return { ok: true, message: `Already at "${STAGE_LABEL[r.from]}".` };
  return { ok: true, message: `Moved from "${STAGE_LABEL[r.from]}" to "${STAGE_LABEL[parsed.data.stage]}".${r.recordAdded ? RECORD_NOTE : ''}` };
}

export type AmountResult = { ok: true; message: string; cents: number | null } | { ok: false; error: string };

/** Sets or clears the expected amount of a deal. The commission is worked out again by the database; the audit trigger records the change. */
export async function updateAmountAction(input: unknown): Promise<AmountResult> {
  await requireStaff();
  const parsed = updateAmountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the amount.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('deals').update({ amount_cents: parsed.data.amount }).eq('id', parsed.data.id).select('id');
  if (error) return { ok: false, error: 'Could not save the amount. Try again.' };
  if (!data || data.length === 0) return { ok: false, error: GONE };
  refresh();
  return { ok: true, cents: parsed.data.amount, message: parsed.data.amount == null ? 'Amount cleared.' : `Amount set to ${formatUsd(parsed.data.amount)}.` };
}

export async function deleteDealAction(_prev: DealFormState, formData: FormData): Promise<DealFormState> {
  await requireOwner();
  const parsed = deleteDealSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'Could not delete the deal.' };

  const supabase = await createClient();
  const { data, error } = await supabase.from('deals').delete().eq('id', parsed.data.id).select('id');
  if (error) {
    console.error('deals: delete failed', error.code);
    return { error: 'Could not delete the deal. Try again.' };
  }
  if (!data || data.length === 0) return { error: GONE };

  refresh();
  return { ok: 'Deal deleted.' };
}
