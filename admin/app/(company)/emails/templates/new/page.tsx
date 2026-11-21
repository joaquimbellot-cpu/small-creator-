import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff';
import { TemplateForm } from '../TemplateForm';

export const metadata: Metadata = { title: 'New template' };

export default async function NewTemplatePage() {
  await requireStaff();
  return <TemplateForm />;
}
