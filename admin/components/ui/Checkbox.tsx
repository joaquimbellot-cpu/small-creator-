// A labelled tick box that matches the rest of the back office (20px, pen-blue tick).
//   <Checkbox label="Only creators with an email" checked={on} onChange={(e) => setOn(e.target.checked)} />
// Works in server components when you pass no handler (for example inside a form with a name).
import type { ComponentProps, ReactNode } from 'react';
import k from './kit.module.css';

export function Checkbox({ label, hint, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={`${k.checkRow} ${className ?? ''}`}>
      <input type="checkbox" {...rest} />
      <span>
        {label}
        {hint ? <span className={`${k.muted} ${k.small}`}> {hint}</span> : null}
      </span>
    </label>
  );
}
