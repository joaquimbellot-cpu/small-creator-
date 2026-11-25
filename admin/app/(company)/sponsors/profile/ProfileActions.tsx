'use client';
// Delete button of a sponsor profile (owner only; the server action refuses when deals or sponsorship records exist).
import { useState } from 'react';
import { ConfirmButton, Notice } from '@/components/ui';
import { deleteSponsor } from '../actions';

export function DeleteSponsor({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState('');
  return (
    <>
      <ConfirmButton
        size="md" title={`Delete ${name}?`} confirmLabel="Delete sponsor"
        message="This removes the sponsor and its contact people for good. It cannot be undone. A sponsor with deals or sponsorship records cannot be deleted."
        onConfirm={async () => {
          setError('');
          // On success the action redirects to the list; it only comes back here with a refusal.
          const r = await deleteSponsor(id);
          if (r && !r.ok) setError(r.error);
        }}
      >Delete</ConfirmButton>
      {error ? <div style={{ flexBasis: '100%' }}><Notice tone="error">{error}</Notice></div> : null}
    </>
  );
}
