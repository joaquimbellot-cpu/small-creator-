// Hairline table. Plain markup inside, so any column layout works:
//   <Table clickable?><thead><tr><th>Name</th><th className={tableCell.num}>Amount</th></tr></thead><tbody>...</tbody></Table>
// Helper classes (import { tableCell }): tableCell.num (right aligned numbers), tableCell.actions (right aligned buttons).
// Sortable header: <th><SortLink href="?sort=name">Name</SortLink></th> (just a styled link; you build the href).
import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './ui.module.css';

export const tableCell = { num: s.num, actions: s.actions };

export function Table({ children, clickable, label }: { children: ReactNode; clickable?: boolean; label?: string }) {
  return (
    <div className={s.tableWrap}>
      <table className={`${s.table} ${clickable ? s.clickable : ''}`} aria-label={label}>{children}</table>
    </div>
  );
}

export function SortLink({ href, children, active }: { href: string; children: ReactNode; active?: 'asc' | 'desc' | false }) {
  return (
    <Link href={href}>
      {children}{active ? (active === 'asc' ? ' ↑' : ' ↓') : ''}
    </Link>
  );
}
