// Centered "nothing here" block. <EmptyState title="No creators yet" action={<LinkButton .../>}>Short explanation.</EmptyState>
import type { ReactNode } from 'react';
import s from './ui.module.css';

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
