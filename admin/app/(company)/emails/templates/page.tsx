import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmButton, EmptyState, LinkButton, Notice, Table, tableCell } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { deleteTemplateAction } from './actions';

export const metadata: Metadata = { title: 'Templates' };

export default async function TemplatesPage() {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.from('email_templates').select('id, name, goal, subject').order('name');
  return (
    <>
      <div className="toolbar"><LinkButton href="/emails/templates/new">New template</LinkButton></div>
      {error ? (
        <Notice tone="error">The templates could not be loaded. Refresh the page to try again.</Notice>
      ) : !data?.length ? (
        <EmptyState title="No templates yet">A template is a subject and body with placeholders such as {'{{first_name}}'}.</EmptyState>
      ) : (
        <Table label="Templates">
          <thead><tr><th>Name</th><th>Subject</th><th className={tableCell.actions}>Actions</th></tr></thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>{t.name}{t.goal ? <div className="muted">{t.goal}</div> : null}</td>
                <td>{t.subject}</td>
                <td className={tableCell.actions}>
                  <Link href={`/emails/templates/${t.id}`}>Edit</Link>{' '}
                  {staff.role === 'owner' ? (
                    <form action={deleteTemplateAction} className="inline-form">
                      <input type="hidden" name="id" value={t.id} />
                      <ConfirmButton title="Delete this template?" message={`"${t.name}" will be deleted.`} confirmLabel="Delete">Delete</ConfirmButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
