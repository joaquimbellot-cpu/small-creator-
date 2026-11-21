'use server';
// Review actions. None of them sends: sending only happens through POST /api/emails/<id>/send.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { draftProblem } from '@/lib/drafting/validate';

export type EditState = { error?: string; message?: string };

const Id = z.guid();

/** Save the text, or save and approve (the clicked button sends intent=save or intent=approve). */
export async function editAction(_prev: EditState, form: FormData): Promise<EditState> {
  await requireStaff();
  const id = Id.safeParse(form.get('id'));
  if (!id.success) return { error: 'Invalid input.' };
  const subject = String(form.get('subject') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  const problem = draftProblem({ subject, body });
  if (problem) return { error: problem };

  const approve = form.get('intent') === 'approve';
  const supabase = await createClient();
  // Editing an approved email puts it back to draft (a database rule), so approval always matches what was read.
  const { error } = await supabase
    .from('emails')
    .update({ subject, body, ...(approve ? { status: 'approved' } : {}) })
    .eq('id', id.data)
    .in('status', ['draft', 'approved']);
  if (error) return { error: 'Could not save. The creator may be blocked or the email was already sent.' };
  revalidatePath('/emails/review');
  return { message: approve ? 'Approved.' : 'Saved.' };
}

export async function backToDraftAction(form: FormData) {
  await requireStaff();
  const id = Id.safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('emails').update({ status: 'draft' }).eq('id', id.data).eq('status', 'approved');
  revalidatePath('/emails/review');
}

export async function discardAction(form: FormData) {
  await requireStaff();
  const id = Id.safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('emails').delete().eq('id', id.data).in('status', ['draft', 'approved']);
  revalidatePath('/emails/review');
}
