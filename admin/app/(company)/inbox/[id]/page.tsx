import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, ConfirmButton } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/deals/format';
import { messageIdSchema } from '@/lib/forms/schemas';
import { deleteMessageAction, setHandledAction } from '../actions';

export const metadata: Metadata = { title: 'Message' };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const id = messageIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: m } = await supabase
    .from('contact_messages')
    .select('id, name, email, topic, message, created_at, handled_at, handled_by')
    .eq('id', id.data)
    .maybeSingle();
  if (!m) notFound();

  await logAudit('contact.viewed', 'contact_message', m.id, { label: String(m.name).slice(0, 200) });

  let handledBy = '';
  if (m.handled_by) {
    const { data: p } = await supabase.from('profiles').select('full_name, email').eq('id', m.handled_by).maybeSingle();
    handledBy = p?.full_name || p?.email || '';
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{m.topic || 'Message'}</h1>
        <Link href="/inbox">Back to the inbox</Link>
      </div>
      <section className="tile" aria-label="Message">
        <dl>
          <dt className="label">From</dt>
          <dd>{m.name}</dd>
          <dt className="label">Email</dt>
          <dd>{m.email}</dd>
          <dt className="label">Received</dt>
          <dd>{formatWhen(m.created_at)}</dd>
          <dt className="label">Status</dt>
          <dd>
            {m.handled_at ? <Badge tone="good">Handled</Badge> : <Badge tone="warn">New</Badge>}
            {m.handled_at ? ` ${formatWhen(m.handled_at)}${handledBy ? ` by ${handledBy}` : ''}` : ''}
          </dd>
        </dl>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.message}</p>
        <div className="toolbar">
          <form action={setHandledAction} className="inline-form">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="handled" value={m.handled_at ? '0' : '1'} />
            <Button type="submit" variant={m.handled_at ? 'ghost' : 'primary'}>{m.handled_at ? 'Mark as not handled' : 'Mark as handled'}</Button>
          </form>
          {staff.role === 'owner' ? (
            <form action={deleteMessageAction} className="inline-form">
              <input type="hidden" name="id" value={m.id} />
              <ConfirmButton title="Delete this message?" message="The message is removed for everyone. This cannot be undone." confirmLabel="Delete">Delete</ConfirmButton>
            </form>
          ) : null}
        </div>
      </section>
    </>
  );
}
