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
    // A scroll box the keyboard can reach (it is a labelled region only when it has a label).
    <div className={s.tableWrap} {...(label ? { role: 'region', tabIndex: 0, 'aria-label': label } : {})}>
      <table className={`${s.table} ${clickable ? s.clickable : ''}`}>{children}</table>
    </div>
  );
}

export function SortLink({ href, children, active }: { href: string; children: ReactNode; active?: 'asc' | 'desc' | false }) {
  return (
    <Link href={href} prefetch={false}>
      {children}{active ? (active === 'asc' ? ' ↑' : ' ↓') : ''}
    </Link>
  );
}
