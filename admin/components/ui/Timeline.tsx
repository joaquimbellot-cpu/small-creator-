// A vertical timeline. Server-safe.
//   <Timeline>
//     <TimelineItem date="12 Mar 2026" title={<strong>Acme</strong>} badge={<SourceBadge source="confirmed" />}
//       lines={['Video: "Setup tour" · 12,400 views']} note="Confirmed by Sam on 14 Mar 2026." actions={<Button size="sm" variant="ghost">Edit</Button>} />
//     <TimelineItem dashed date="2 Feb 2026" title={<strong>Brand not named</strong>} badge={<SourceBadge source="detected" />} ... />
//   </Timeline>
import type { ReactNode } from 'react';
import k from './kit.module.css';

export function Timeline({ children, label }: { children: ReactNode; label?: string }) {
  return <ol className={k.tl} aria-label={label}>{children}</ol>;
}

export function TimelineItem({ date, title, badge, lines, note, actions, dashed, children }: {
  /** The date as text, already formatted. */
  date: ReactNode;
  /** First row: usually the name as a link or <strong>. */
  title: ReactNode;
  /** Shown after the title (a SourceBadge). */
  badge?: ReactNode;
  /** Detail lines, small text. */
  lines?: ReactNode[];
  /** One more line in muted text (who confirmed it, where it came from). */
  note?: ReactNode;
  /** Row of buttons under the text. */
  actions?: ReactNode;
  /** Detected, not yet checked: dashed amber marker. */
  dashed?: boolean;
  /** Anything else, shown after the lines and before the actions (for example an inline form). */
  children?: ReactNode;
}) {
  return (
    <li className={`${k.tlItem} ${dashed ? k.tlDashed : ''}`}>
      <div className={k.tlWhen}>{date}</div>
      <div className={k.tlTitle}>{title}{badge ? <> {badge}</> : null}</div>
      {lines?.map((l, i) => <div key={i} className={k.tlLine}>{l}</div>)}
      {note ? <div className={`${k.tlLine} ${k.muted}`}>{note}</div> : null}
      {children}
      {actions ? <div className={k.tlActions}>{actions}</div> : null}
    </li>
  );
}
