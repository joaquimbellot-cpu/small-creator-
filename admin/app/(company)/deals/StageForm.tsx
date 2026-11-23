'use client';
// One row's stage dropdown. Picking a stage changes nothing until the person presses Save
// (updateStageAction changes only `stage`), so arrow keys cannot save a wrong stage on the way.
import { useActionState, useEffect, useState } from 'react';
import { Button, controlClass } from '@/components/ui';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/deals/format';
import { updateStageAction, type DealFormState } from './actions';

export function StageForm({ id, stage, label }: { id: string; stage: Stage; label: string }) {
  const [state, action, pending] = useActionState<DealFormState, FormData>(updateStageAction, {});
  const [value, setValue] = useState<Stage>(stage);
  // Follow the saved stage (after Save, or when someone else changed it).
  useEffect(() => setValue(stage), [stage]);
  const changed = value !== stage;
  return (
    <form action={action} className="inline-form" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="id" value={id} />
      <select name="stage" value={value} aria-label={label} className={controlClass} style={{ width: 'auto' }} disabled={pending} onChange={(e) => setValue(e.target.value as Stage)}>
        {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
      </select>
      {changed ? <Button type="submit" size="sm" loading={pending}>Save</Button> : null}
      {!changed && state.ok ? <span role="status" className="muted">{state.ok}</span> : null}
      {state.error ? <span role="alert" style={{ color: '#9B2C1F' }}>{state.error}</span> : null}
    </form>
  );
}
