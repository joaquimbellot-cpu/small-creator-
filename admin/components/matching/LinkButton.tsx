'use client';
// Opens the "Link a creator and a sponsor" dialog with one or both sides already chosen. Creates a deal at "matched".
import { useState } from 'react';
import { Button } from '@/components/ui';
import { LinkDialog } from './LinkDialog';

export function LinkButton({ creatorId, brandId, size = 'sm', label, variant = 'primary' }: {
  creatorId?: string; brandId?: string; size?: 'md' | 'sm'; label?: string; variant?: 'primary' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const text = label ?? (creatorId && brandId ? 'Link' : creatorId ? 'Link to a sponsor' : brandId ? 'Link to a creator' : 'Link a creator and a sponsor');
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} aria-haspopup="dialog">{text}</Button>
      {open ? <LinkDialog open onClose={() => setOpen(false)} creatorId={creatorId} brandId={brandId} /> : null}
    </>
  );
}
