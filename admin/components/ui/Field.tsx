// Form fields with a label, hint and error message.
//   <Input name label error? hint? ...native input props />
//   <Select name label error? hint?> <option/>... </Select>
//   <Textarea name label error? hint? rows? />
//   <Field label htmlFor error? hint?>{custom control with className={controlClass}}</Field>
// `error` is a string; when set the field gets the red frame and aria-invalid.
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import s from './ui.module.css';

export const controlClass = s.control;

type Meta = { label: string; error?: string; hint?: string };

export function Field({ label, htmlFor, error, hint, children }: Meta & { htmlFor: string; children: ReactNode }) {
  return (
    <div className={`${s.field} ${error ? s.hasError : ''}`}>
      <label className={s.label} htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error ? <div className={s.hint} id={`${htmlFor}-hint`}>{hint}</div> : null}
      {error ? <div className={s.error} id={`${htmlFor}-err`} role="alert">{error}</div> : null}
    </div>
  );
}

function aria(id: string, error?: string, hint?: string) {
  return { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined } as const;
}

export function Input({ label, error, hint, id, className, ...rest }: Meta & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint}>
      <input id={fid} className={`${s.control} ${className ?? ''}`} {...aria(fid, error, hint)} {...rest} />
    </Field>
  );
}

export function Select({ label, error, hint, id, className, children, ...rest }: Meta & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint}>
      <select id={fid} className={`${s.control} ${className ?? ''}`} {...aria(fid, error, hint)} {...rest}>{children}</select>
    </Field>
  );
}

export function Textarea({ label, error, hint, id, className, ...rest }: Meta & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint}>
      <textarea id={fid} className={`${s.control} ${className ?? ''}`} {...aria(fid, error, hint)} {...rest} />
    </Field>
  );
}
