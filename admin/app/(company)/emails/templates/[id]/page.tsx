import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { TemplateForm } from '../TemplateForm';

export const metadata: Metadata = { title: 'Edit template' };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('email_templates').select('id, name, goal, subject, body').eq('id', id).maybeSingle();
  if (!data) notFound();
  return <TemplateForm template={data} />;
}
