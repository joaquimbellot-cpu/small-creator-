'use client';
// Owner's delete button for one deal. Shows the reason when the delete fails instead of doing nothing.
import { useActionState } from 'react';
import { ConfirmButton, useToast } from '@/components/ui';
import { deleteDealAction, type DealFormState } from './actions';

export function DeleteDealForm({ id, brand }: { id: string; brand: string }) {
  const toast = useToast();
  // The toast is shown when the answer arrives: the row is gone a moment later, and so is this form.
  const [state, action] = useActionState<DealFormState, FormData>(async (prev, formData) => {
    const r = await deleteDealAction(prev, formData);
    if (r.ok) toast(r.ok);
    return r;
  }, {});
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton title={`Delete the ${brand} deal?`} message="The deal is removed for everyone. Its commission goes with it. The audit log keeps a record." confirmLabel="Delete">Delete</ConfirmButton>
      {state.error ? <div role="alert" className="muted" style={{ color: '#9B2C1F' }}>{state.error}</div> : null}
    </form>
  );
}
