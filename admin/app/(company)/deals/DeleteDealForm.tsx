'use client';
// Owner's delete button for one deal. Shows the reason when the delete fails instead of doing nothing.
import { useActionState } from 'react';
import { ConfirmButton } from '@/components/ui';
import { deleteDealAction, type DealFormState } from './actions';

export function DeleteDealForm({ id, brand }: { id: string; brand: string }) {
  const [state, action] = useActionState<DealFormState, FormData>(deleteDealAction, {});
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton title={`Delete the ${brand} deal?`} message="The deal is removed for everyone. Its commission goes with it. The audit log keeps a record." confirmLabel="Delete">Delete</ConfirmButton>
      {state.error ? <div role="alert" className="muted" style={{ color: '#9B2C1F' }}>{state.error}</div> : null}
    </form>
  );
}
