'use client';
// Button that asks "Are you sure?" in a modal first.
//   Inside a <form action={serverAction}>: <ConfirmButton title="Remove Sam?" message="..." confirmLabel="Remove">Remove</ConfirmButton>
//     -> on confirm the surrounding form is submitted (so hidden inputs and server actions work).
//   Or with a callback: <ConfirmButton onConfirm={() => doIt()} ...>
// Props: children (button label), title, message, confirmLabel (default "Confirm"), variant (default "danger"), size, disabled.
import { useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { Modal } from './Modal';

export function ConfirmButton({ children, title, message, confirmLabel = 'Confirm', variant = 'danger', size = 'sm', disabled, onConfirm }: {
  children: ReactNode; title: string; message: ReactNode; confirmLabel?: string; variant?: ButtonVariant; size?: 'md' | 'sm'; disabled?: boolean; onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  function confirm() {
    setOpen(false);
    if (onConfirm) onConfirm();
    else ref.current?.closest('form')?.requestSubmit();
  }
  return (
    <>
      <Button ref={ref} variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>{children}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="dangerSolid" onClick={confirm} data-autofocus>{confirmLabel}</Button>
        </>
      }>
        <p style={{ margin: 0 }}>{message}</p>
      </Modal>
    </>
  );
}
