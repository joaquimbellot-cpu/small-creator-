'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';

export type SendingState = { error?: string; saved?: boolean };

const Schema = z
  .object({
    daily_send_limit: z.coerce.number().int().min(1, 'Daily limit must be 1 to 500.').max(500, 'Daily limit must be 1 to 500.'),
    min_seconds_between_sends: z.coerce.number().int().min(2, 'Seconds between sends must be 2 to 120.').max(120, 'Seconds between sends must be 2 to 120.'),
    test_mode: z.boolean(),
    test_email: z.string().trim().max(320),
    sender_name: z.string().trim().min(1, 'Sender name is required.').max(200),
    sender_postal_address: z.string().trim().max(500),
  })
  .refine((v) => !v.test_mode || /^[^@\s]+@[^@\s]+$/.test(v.test_email), { message: 'Test mode needs a valid test address.', path: ['test_email'] })
  .refine((v) => v.test_mode || v.sender_postal_address.length > 0, { message: 'Real sending needs a postal address. Enter one before turning test mode off.', path: ['sender_postal_address'] });

export async function saveSendingAction(_prev: SendingState, form: FormData): Promise<SendingState> {
  await requireOwner(); // owner only, checked here on the server (the database checks it too)
  const parsed = Schema.safeParse({ ...Object.fromEntries(form), test_mode: form.get('test_mode') === 'on' });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from('settings')
    .update({ ...v, test_email: v.test_email || null, sender_postal_address: v.sender_postal_address || null })
    .eq('id', 1);
  if (error) return { error: 'Could not save the settings.' };
  revalidatePath('/settings/sending');
  return { saved: true };
}
