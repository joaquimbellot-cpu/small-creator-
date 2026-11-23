'use server';
// Actions on one email in the log. Both go through the database rules (mark_replied, failed -> draft).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';

export type EmailActionState = { error?: string };

export async function markRepliedAction(_prev: EmailActionState, form: FormData): Promise<EmailActionState> {
  await requireStaff();
  const id = z.guid().safeParse(form.get('id'));
  if (!id.success) return { error: 'Could not mark the email as replied.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_replied', { email_id: id.data });
  if (error) {
    console.error('emails: mark_replied failed', error.code);
    return { error: 'Could not mark the email as replied. Try again.' };
  }
  revalidatePath(`/emails/${id.data}`);
  return {};
}

/** A failed email goes back to draft so it can be fixed, approved and sent again. */
export async function retryAction(_prev: EmailActionState, form: FormData): Promise<EmailActionState> {
  await requireStaff();
  const id = z.guid().safeParse(form.get('id'));
  if (!id.success) return { error: 'Could not move the email back to draft.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('emails').update({ status: 'draft' }).eq('id', id.data).eq('status', 'failed').select('id');
  if (error) {
    console.error('emails: retry failed', error.code);
    return { error: 'Could not move the email back to draft. Try again.' };
  }
  // No row changed: someone else already moved it on.
  if (!data?.length) return { error: 'This email is no longer failed, so it was left as it is. Reload the page.' };
  revalidatePath(`/emails/${id.data}`);
  return {};
}
