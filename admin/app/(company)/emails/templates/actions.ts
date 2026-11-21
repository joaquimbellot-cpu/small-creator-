'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOwner, requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { MAX_BODY, MAX_SUBJECT, PLACEHOLDERS } from '@/lib/drafting/validate';

export type TemplateState = { error?: string };

const Template = z.object({
  name: z.string().trim().min(1, 'Give the template a name.').max(200),
  goal: z.string().trim().max(2000),
  subject: z.string().trim().min(1, 'The subject is empty.').max(MAX_SUBJECT, `The subject is longer than ${MAX_SUBJECT} characters.`),
  body: z.string().trim().min(1, 'The body is empty.').max(MAX_BODY, `The body is longer than ${MAX_BODY} characters.`),
});

// Only the four known placeholders are allowed, so a typo cannot reach a creator.
function unknownPlaceholder(text: string): string | null {
  for (const m of text.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!(PLACEHOLDERS as readonly string[]).includes(m[1])) return m[0];
  }
  return null;
}

/** Create (no id) or update (hidden id) a template. */
export async function saveTemplateAction(_prev: TemplateState, form: FormData): Promise<TemplateState> {
  await requireStaff();
  const parsed = Template.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const bad = unknownPlaceholder(parsed.data.subject) ?? unknownPlaceholder(parsed.data.body);
  if (bad) return { error: `${bad} is not a known placeholder.` };

  const supabase = await createClient();
  const id = String(form.get('id') ?? '');
  const row = { ...parsed.data, goal: parsed.data.goal || null };
  const { error } = id
    ? await supabase.from('email_templates').update(row).eq('id', id)
    : await supabase.from('email_templates').insert(row);
  if (error) return { error: 'Could not save the template.' };
  revalidatePath('/emails/templates');
  redirect('/emails/templates');
}

export async function deleteTemplateAction(form: FormData) {
  await requireOwner(); // only the owner deletes (the database checks this too)
  const id = z.uuid().safeParse(form.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from('email_templates').delete().eq('id', id.data);
  revalidatePath('/emails/templates');
}
