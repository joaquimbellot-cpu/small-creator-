// Small uppercase tag. <Badge tone="neutral|accent|good|warn|bad">Active</Badge>
import type { ReactNode } from 'react';
import s from './ui.module.css';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={`${s.badge} ${tone !== 'neutral' ? s[tone] : ''}`}>{children}</span>;
}
