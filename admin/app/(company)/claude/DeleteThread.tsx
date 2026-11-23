'use client';
// "Delete conversation" for the open conversation, with an "Are you sure?" dialog.
import { useActionState } from 'react';
import { ConfirmButton, Notice } from '@/components/ui';
import { deleteThreadAction, type DeleteThreadState } from './actions';

export function DeleteThread({ id }: { id: string }) {
  const [state, action] = useActionState<DeleteThreadState, FormData>(deleteThreadAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <ConfirmButton title="Delete this conversation?" message="The messages and Claude's proposed changes in this conversation are deleted for good. Changes you already approved stay as they are." confirmLabel="Delete conversation">Delete conversation</ConfirmButton>
    </form>
  );
}
