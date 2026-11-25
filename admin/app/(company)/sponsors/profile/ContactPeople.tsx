'use client';
// Contact people of one sponsor: list, add, edit, set the main contact, delete (owner only).
// Email, phone and LinkedIn are personal data; the page that renders this wrote the "brand.viewed" audit line.
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, ConfirmButton, Input, Modal, Notice, Checkbox, useToast } from '@/components/ui';
import { isHttpsUrl } from '@/lib/sponsors/schema';
import { deleteContact, saveContact, setMainContact, type FormState } from '../actions';
import s from '../sponsors.module.css';

export type Contact = { id: string; full_name: string; role_title: string | null; email: string | null; phone: string | null; linkedin_url: string | null; is_primary: boolean };

export function ContactPeople({ brandId, contacts, isOwner }: { brandId: string; contacts: Contact[]; isOwner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [error, setError] = useState('');
  const [, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setError('');
    start(async () => {
      const r = await fn();
      if (r.ok) { if (r.message) toast(r.message); router.refresh(); } else setError(r.error ?? 'Something went wrong.');
    });
  }

  return (
    <section className="panel-sec" aria-labelledby={`people-${brandId}`}>
      <div className="panel-sec__head">
        <h3 id={`people-${brandId}`}>Contact people</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing('new')}>Add a person</Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {contacts.length === 0 ? <p className="muted">No contact person yet. A pitch to this sponsor needs one.</p> : null}
      {contacts.map((c) => (
        <div key={c.id} className={s.personRow} data-testid="contact-row">
          <div className={s.personTop}>
            <span><strong>{c.full_name}</strong> {c.is_primary ? <Badge tone="accent">Main contact</Badge> : null}</span>
            {c.role_title ? <span className={s.personMeta}>{c.role_title}</span> : null}
          </div>
          <div className={s.personMeta}>
            {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span>No email</span>}
            {c.phone ? <span> · {c.phone}</span> : null}
            {c.linkedin_url && isHttpsUrl(c.linkedin_url) ? <span> · <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a></span> : null}
          </div>
          <div className={s.personActions}>
            <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>Edit</Button>
            {!c.is_primary ? <Button variant="ghost" size="sm" onClick={() => run(() => setMainContact(c.id))}>Make main contact</Button> : null}
            {isOwner ? (
              <ConfirmButton title={`Remove ${c.full_name}?`} message="This removes the person from this sponsor. It cannot be undone." confirmLabel="Remove person" onConfirm={() => run(() => deleteContact(c.id))}>Remove</ConfirmButton>
            ) : null}
          </div>
        </div>
      ))}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a person' : 'Edit person'}>
        {editing ? <ContactForm key={editing === 'new' ? 'new' : editing.id} brandId={brandId} initial={editing === 'new' ? null : editing} first={contacts.length === 0} onClose={() => setEditing(null)} /> : null}
      </Modal>
    </section>
  );
}

function ContactForm({ brandId, initial, first, onClose }: { brandId: string; initial: Contact | null; first: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveContact, null);
  const router = useRouter();
  const toast = useToast();
  const v = (state?.values ?? {}) as Record<string, string>;
  const e = state?.errors ?? {};
  const val = (k: keyof Contact) => (state?.values ? v[k] ?? '' : String(initial?.[k] ?? ''));
  useEffect(() => {
    if (state?.ok) { toast('Person saved.'); onClose(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} noValidate>
      <input type="hidden" name="brand_id" value={brandId} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial?.is_primary ? <input type="hidden" name="was_primary" value="1" /> : null}
      <div className={s.formGrid}>
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <div className={s.two}>
          <Input name="full_name" label="Name" required maxLength={200} defaultValue={val('full_name')} error={e.full_name} data-autofocus />
          <Input name="role_title" label="Role (optional)" maxLength={200} defaultValue={val('role_title')} error={e.role_title} />
        </div>
        <div className={s.two}>
          <Input name="email" label="Email (optional)" type="email" maxLength={320} defaultValue={val('email')} error={e.email} />
          <Input name="phone" label="Phone (optional)" maxLength={50} defaultValue={val('phone')} error={e.phone} />
        </div>
        <Input name="linkedin_url" label="LinkedIn (optional)" placeholder="https://www.linkedin.com/in/name" maxLength={500} defaultValue={val('linkedin_url')} error={e.linkedin_url}
          hint="Must be a linkedin.com address that starts with https://." />
        <Checkbox name="is_primary" label="Main contact for this sponsor" defaultChecked={state?.values ? v.is_primary === '1' : initial ? initial.is_primary : first} />
        <div className={s.actions}>
          <Button type="submit" loading={pending}>{initial ? 'Save changes' : 'Add person'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
