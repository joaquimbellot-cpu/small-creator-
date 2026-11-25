'use client';
// The amount of one deal, with an "Edit" button that turns it into a small form (board cards and the table).
// Staff only (the server action checks). An empty amount means "not set"; the database works out the commission again.
import { useRef, useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { formatAmount } from '@/lib/deals/format';
import { updateAmountAction } from './actions';
import s from './deals.module.css';

export function AmountEditor({ id, cents, who, emptyText = 'Amount not set', onSaved }: {
  id: string; cents: number | null; who: string; emptyText?: string; onSaved?: (cents: number | null) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  function start() {
    setText(cents == null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''));
    setError(''); setEditing(true);
    setTimeout(() => input.current?.focus(), 0);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const r = await updateAmountAction({ id, amount: text }).catch(() => ({ ok: false as const, error: 'Could not reach the server. Try again.' }));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setEditing(false); onSaved?.(r.cents); toast(r.message);
  }

  if (!editing) {
    return (
      <span className={s.amount}>
        <span className={cents == null ? 'muted' : undefined}>{formatAmount(cents, emptyText)}</span>
        <button type="button" className={s.textBtn} onClick={start} aria-label={`Edit the amount of ${who}`}>Edit</button>
      </span>
    );
  }
  return (
    <form className={s.amountForm} onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}>
      <label className="sr-only" htmlFor={`amt-${id}`}>Amount in US dollars for {who}</label>
      <input ref={input} id={`amt-${id}`} className={s.amountInput} inputMode="decimal" placeholder="Not set" value={text} maxLength={14}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `amt-${id}-err` : undefined} onChange={(e) => setText(e.target.value)} />
      <Button type="submit" size="sm" loading={busy}>Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      {error ? <span id={`amt-${id}-err`} role="alert" className={s.err}>{error}</span> : null}
    </form>
  );
}
