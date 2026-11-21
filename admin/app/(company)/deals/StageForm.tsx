'use client';
// One row's stage dropdown. Choosing a stage submits the form (updateStageAction changes only `stage`).
import { useActionState } from 'react';
import { Notice, controlClass } from '@/components/ui';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/deals/format';
import { updateStageAction, type DealFormState } from './actions';

export function StageForm({ id, stage, label }: { id: string; stage: Stage; label: string }) {
  const [state, action, pending] = useActionState<DealFormState, FormData>(updateStageAction, {});
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="stage"
        value={stage}
        aria-label={label}
        className={controlClass}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </select>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}
