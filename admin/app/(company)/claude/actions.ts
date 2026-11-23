'use server';
// The owner can delete one Claude conversation (its messages and proposals go with it).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

export type DeleteThreadState = { error?: string };

export async function deleteThreadAction(_prev: DeleteThreadState, form: FormData): Promise<DeleteThreadState> {
  await requireOwner();
  const id = z.guid().safeParse(form.get('id'));
  if (!id.success) return { error: 'Could not delete the conversation.' };
  const supabase = await createClient();
  // select() returns the deleted rows, so "nothing was deleted" (for example a missing permission) is not mistaken for success.
  const { data, error } = await supabase.from('assistant_threads').delete().eq('id', id.data).select('id');
  if (error) {
    console.error('claude: delete conversation failed', error.code);
    return { error: 'Could not delete the conversation. Try again.' };
  }
  if (!data?.length) return { error: 'The conversation was not deleted. It may already be gone, or the database does not allow it yet.' };
  await logAudit('assistant.thread_deleted', 'assistant_thread', id.data);
  revalidatePath('/claude');
  redirect('/claude');
}
