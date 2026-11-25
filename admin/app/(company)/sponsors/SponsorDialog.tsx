'use client';
// Add or edit a sponsor in a dialog. The server action checks everything again; this form only shows what comes back.
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Input, Modal, Notice, Select, Textarea, useToast } from '@/components/ui';
import { COMPANY_SIZES, COMPANY_SIZE_LABEL, COUNTRY_CODES, NICHES, RELATIONSHIPS, RELATIONSHIP_LABEL, countryName } from '@/lib/sponsors/constants';
import type { SponsorFormValues } from '@/lib/sponsors/format';
import { saveSponsor, type FormState } from './actions';
import s from './sponsors.module.css';

const EMPTY: SponsorFormValues = {
  name: '', website: '', industry: '', country: '', company_size: '', niches: [], target_min_subs: '', target_max_subs: '',
  budget_min: '', budget_max: '', relationship: 'prospect', notes: '',
};

export function SponsorDialog({ mode, initial, label, variant, size = 'md' }: {
  mode: 'add' | 'edit';
  initial?: SponsorFormValues;
  label: string;
  variant?: 'primary' | 'ghost';
  size?: 'md' | 'sm';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={mode === 'add' ? 'Add a sponsor' : 'Edit sponsor'} wide>
        <SponsorForm mode={mode} initial={initial ?? EMPTY} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function SponsorForm({ mode, initial, onClose }: { mode: 'add' | 'edit'; initial: SponsorFormValues; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSponsor, null);
  const router = useRouter();
  const toast = useToast();
  const v = (state?.values as Partial<SponsorFormValues> | undefined) ?? initial;
  const e = state?.errors ?? {};
  const str = (k: keyof SponsorFormValues) => String(v[k] ?? '');
  const niches = Array.isArray(v.niches) ? v.niches : [];

  useEffect(() => {
    if (state?.ok) { toast('Sponsor saved.'); onClose(); router.refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const codes = [...COUNTRY_CODES].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const cur = str('country');
  if (cur && !codes.includes(cur)) codes.unshift(cur);

  return (
    <form action={action} noValidate>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className={s.formGrid}>
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <div className={s.two}>
          <Input name="name" label="Company name" required maxLength={200} defaultValue={str('name')} error={e.name} data-autofocus />
          <Input name="website" label="Website" placeholder="https://example.com" maxLength={500} defaultValue={str('website')} error={e.website} />
        </div>
        <div className={s.two}>
          <Input name="industry" label="Industry" placeholder="For example: Kitchenware" maxLength={200} defaultValue={str('industry')} error={e.industry} />
          <Select name="country" label="Location" defaultValue={cur} error={e.country}>
            <option value="">Not set</option>
            {codes.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </Select>
        </div>
        <div className={s.two}>
          <Select name="company_size" label="Company size (people)" defaultValue={str('company_size')} error={e.company_size}>
            <option value="">Not set</option>
            {COMPANY_SIZES.map((c) => <option key={c} value={c}>{COMPANY_SIZE_LABEL[c]}</option>)}
          </Select>
          <Select name="relationship" label="Contact status" defaultValue={str('relationship') || 'prospect'} error={e.relationship}>
            {RELATIONSHIPS.map((r) => <option key={r} value={r}>{RELATIONSHIP_LABEL[r]}</option>)}
          </Select>
        </div>
        <fieldset className={s.nicheBox}>
          <legend>Niches they sponsor</legend>
          {NICHES.map((n) => <Checkbox key={n.slug} name="niches" value={n.slug} label={n.name} defaultChecked={niches.includes(n.slug)} />)}
        </fieldset>
        {e.niches ? <Notice tone="error">{e.niches}</Notice> : null}
        <div className={s.two}>
          <Input name="target_min_subs" label="Target creator size, from" inputMode="text" placeholder="For example 5k" defaultValue={str('target_min_subs')} error={e.target_min_subs} hint="Subscribers. You can type 5k or 1.5M." />
          <Input name="target_max_subs" label="Target creator size, to" inputMode="text" placeholder="For example 50k" defaultValue={str('target_max_subs')} error={e.target_max_subs} />
        </div>
        <div className={s.two}>
          <Input name="budget_min" label="Typical budget per creator, from (USD)" inputMode="decimal" placeholder="For example 200" defaultValue={str('budget_min')} error={e.budget_min} />
          <Input name="budget_max" label="Typical budget per creator, to (USD)" inputMode="decimal" placeholder="For example 1,000" defaultValue={str('budget_max')} error={e.budget_max} />
        </div>
        <Textarea name="notes" label="Notes (optional)" rows={4} maxLength={5000} defaultValue={str('notes')} error={e.notes} />
        <div className={s.actions}>
          <Button type="submit" loading={pending}>{mode === 'add' ? 'Add sponsor' : 'Save changes'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
