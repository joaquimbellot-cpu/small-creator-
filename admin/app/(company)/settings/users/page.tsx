import type { Metadata } from 'next';
import { Badge, ConfirmButton, Button, Table, tableCell } from '@/components/ui';
import { requireOwner } from '@/lib/auth/staff';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { InviteForm } from './InviteForm';
import { removeUserAction, restoreUserAction } from './actions';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage() {
  const me = await requireOwner();
  const supabase = await createClient();
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, role, is_active, created_at').order('created_at');

  // Who has signed in yet (to tell "invited" from "active").
  const { data: list } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
  const signedIn = new Map((list?.users ?? []).map((u) => [u.id, !!u.last_sign_in_at]));
  const activeOwners = (profiles ?? []).filter((p) => p.role === 'owner' && p.is_active).length;

  return (
    <div className="split">
      <section>
        <Table label="Staff">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th className={tableCell.actions}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const isMe = p.id === me.id;
              const lastOwner = p.role === 'owner' && p.is_active && activeOwners <= 1;
              return (
                <tr key={p.id}>
                  <td>{p.full_name || '–'}{isMe ? <span className="muted"> (you)</span> : null}</td>
                  <td>{String(p.email)}</td>
                  <td>{p.role ?? 'no role'}</td>
                  <td>
                    {!p.is_active ? <Badge tone="bad">Removed</Badge> : signedIn.get(p.id) ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Invited</Badge>}
                  </td>
                  <td className={tableCell.actions}>
                    {isMe || lastOwner ? null : p.is_active ? (
                      <form action={removeUserAction} className="inline-form">
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton title={`Remove ${p.full_name || String(p.email)}?`} message="They are logged out of everything at once and cannot log in again. Their past work stays in the records." confirmLabel="Remove">Remove</ConfirmButton>
                      </form>
                    ) : (
                      <form action={restoreUserAction} className="inline-form">
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" variant="ghost" size="sm">Restore</Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
      <aside><InviteForm /></aside>
    </div>
  );
}
