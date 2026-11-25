'use client';
import { useActionState, useEffect, useRef } from 'react';
import { Button, Input, Notice, Select } from '@/components/ui';
import { STAGES, STAGE_LABEL } from '@/lib/deals/format';
import { addDealAction, type DealFormState } from './actions';

export function AddDealForm({ creators, brands }: { creators: { id: string; full_name: string }[]; brands: string[] }) {
  const [state, action, pending] = useActionState<DealFormState, FormData>(addDealAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="tile">
      <h2 style={{ fontSize: '1.375rem', marginBottom: 16 }}>Add a deal</h2>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      <Select label="Creator" name="creator_id" required defaultValue="" error={fe.creator_id}>
        <option value="" disabled>Choose a creator</option>
        {creators.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
      </Select>
      <Input label="Brand" name="brand_name" required maxLength={200} list="brand-names" autoComplete="off" hint="Type a new name to add the brand." error={fe.brand_name} />
      <datalist id="brand-names">
        {brands.map((b) => <option key={b} value={b} />)}
      </datalist>
      <Input label="Amount (USD)" name="amount" inputMode="decimal" placeholder="250.00" hint="Optional. Leave it empty if the amount is not agreed yet." error={fe.amount} />
      <Select label="Stage" name="stage" defaultValue="contacted" error={fe.stage}>
        {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </Select>
      <Button type="submit" loading={pending}>Add deal</Button>
    </form>
  );
}
