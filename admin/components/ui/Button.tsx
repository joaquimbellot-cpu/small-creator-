// Button and LinkButton.
//   <Button variant="primary|ghost|danger|dangerSolid" size="md|sm" loading? ...native button props>
//   <LinkButton href="/x" variant size>  (a link styled as a button)
// Default type is "button"; pass type="submit" inside forms.
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import s from './ui.module.css';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'dangerSolid';
type Common = { variant?: ButtonVariant; size?: 'md' | 'sm' };

export function buttonClass({ variant = 'primary', size = 'md' }: Common, extra?: string) {
  return [s.btn, variant === 'ghost' && s.ghost, variant === 'danger' && s.danger, variant === 'dangerSolid' && s.dangerSolid, size === 'sm' && s.sm, extra]
    .filter(Boolean)
    .join(' ');
}

export function Button({ variant, size, loading, className, children, disabled, type = 'button', ...rest }: ComponentProps<'button'> & Common & { loading?: boolean }) {
  return (
    <button type={type} className={buttonClass({ variant, size }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? 'Working…' : children}
    </button>
  );
}

export function LinkButton({ variant, size, href, children, className }: Common & { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={buttonClass({ variant, size }, className)}>
      {children}
    </Link>
  );
}
