// SourceBadge and Tag. Server-safe.
//   <SourceBadge source="confirmed" />            green "Confirmed"
//   <SourceBadge source="detected" />             amber dashed "Detected, not verified"
//   <SourceBadge source="detected" short />       "Detected"
//   <Tag>Pays on time</Tag>                       small rounded label
import type { ReactNode } from 'react';
import k from './kit.module.css';

export type SourceLabel = 'confirmed' | 'detected';

export function SourceBadge({ source, short }: { source: SourceLabel; short?: boolean }) {
  if (source === 'confirmed') return <span className={`${k.badge} ${k.confirmed}`}>Confirmed</span>;
  return <span className={`${k.badge} ${k.detected}`}>{short ? 'Detected' : 'Detected, not verified'}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className={k.tag}>{children}</span>;
}
