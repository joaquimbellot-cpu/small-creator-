'use client';
// Sends a form to a server action WITHOUT React 19's automatic form reset.
// With <form action={...}> React empties the fields after every submit, which would throw away
// what the person typed when the server answers with an error. Use: <form onSubmit={submitKeepingValues(action)}>
import { startTransition, type FormEvent } from 'react';

export function submitKeepingValues(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter; // so the clicked button's name and value are included
    startTransition(() => action(new FormData(e.currentTarget, submitter)));
  };
}
