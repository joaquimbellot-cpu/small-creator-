'use server';
// Inbox actions. Staff can mark a message handled or not handled; only the owner can delete.
// Each action checks the role on the server and validates its input with zod. They run as the logged-in user, so RLS applies.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner, requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { messageIdSchema } from '@/lib/forms/schemas';

function refresh(id: string) {
  revalidatePath('/inbox');
  revalidatePath(`/inbox/${id}`);
}

export async function setHandledAction(formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const id = messageIdSchema.safeParse(formData.get('id'));
  const handled = formData.get('handled') === '1';
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from('contact_messages')
    .update(handled ? { handled_at: new Date().toISOString(), handled_by: staff.id } : { handled_at: null, handled_by: null })
    .eq('id', id.data);
  if (error) console.error('inbox: could not update message', error.code);
  refresh(id.data);
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  await requireOwner();
  const id = messageIdSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from('contact_messages').delete().eq('id', id.data);
  if (error) {
    console.error('inbox: could not delete message', error.code);
    return;
  }
  revalidatePath('/inbox');
  redirect('/inbox');
}
