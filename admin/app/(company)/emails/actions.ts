'use server';
// Actions on one email in the log. Both go through the database rules (mark_replied, failed -> draft).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';

export async function markRepliedAction(form: FormData) {
  await requireStaff();
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc('mark_replied', { email_id: id.data });
  revalidatePath(`/emails/${id.data}`);
}

/** A failed email goes back to draft so it can be fixed, approved and sent again. */
export async function retryAction(form: FormData) {
  await requireStaff();
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('emails').update({ status: 'draft' }).eq('id', id.data).eq('status', 'failed');
  revalidatePath(`/emails/${id.data}`);
}
