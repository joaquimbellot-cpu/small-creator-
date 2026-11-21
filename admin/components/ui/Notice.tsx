// Framed message. <Notice tone="info|success|error|warn" title?>text</Notice>
// Errors use role="alert" so screen readers announce them; others role="status".
import type { ReactNode } from 'react';
import s from './ui.module.css';

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'error' | 'warn'; title?: string; children: ReactNode }) {
  const cls = tone === 'error' ? s.nError : tone === 'success' ? s.nSuccess : tone === 'warn' ? s.nWarn : '';
  return (
    <div className={`${s.notice} ${cls}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}
