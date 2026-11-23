// Emails sent (ink) and replies (pen blue) per week, as an inline SVG. No chart library.
// The same numbers are in a table inside <details> for screen readers and anyone who wants exact values.
import { Table, tableCell } from '@/components/ui';
import { formatCount, weekLabel } from '@/lib/deals/format';
import type { WeekPoint } from '@/lib/deals/stats';
import s from './Overview.module.css';

const W = 480;
const H = 230;
const BASE = 170; // baseline y
const TOP = 10;
const BAR = 12;
const GAP = 3;

export function WeeklyChart({ weekly }: { weekly: WeekPoint[] }) {
  const max = Math.max(1, ...weekly.flatMap((w) => [w.sent, w.replies]));
  const slot = weekly.length ? W / weekly.length : W;
  const scale = (v: number) => ((BASE - TOP) * v) / max;
  const total = weekly.reduce((acc, w) => ({ sent: acc.sent + w.sent, replies: acc.replies + w.replies }), { sent: 0, replies: 0 });

  if (weekly.length === 0) return <p className="muted">No weekly figures yet.</p>;

  return (
    <div className={s.chart}>
      <div className={s.legend} aria-hidden="true">
        <span><i className={s.swatchSent} /> Emails sent</span>
        <span><i className={s.swatchReply} /> Replies</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of emails sent and replies for the last ${weekly.length} weeks. Totals: ${total.sent} sent, ${total.replies} replies.`} className={s.svg}>
        <line x1={0} x2={W} y1={BASE} y2={BASE} className={s.axis} />
        {weekly.map((w, i) => {
          const x = i * slot + slot / 2 - BAR - GAP / 2;
          const label = weekLabel(w.week_start);
          return (
            <g key={w.week_start}>
              <rect x={x} y={BASE - scale(w.sent)} width={BAR} height={scale(w.sent)} className={s.barSent}>
                <title>{`Week of ${label.day} ${label.month}: ${w.sent} sent`}</title>
              </rect>
              <rect x={x + BAR + GAP} y={BASE - scale(w.replies)} width={BAR} height={scale(w.replies)} className={s.barReply}>
                <title>{`Week of ${label.day} ${label.month}: ${w.replies} replies`}</title>
              </rect>
              <text x={i * slot + slot / 2} y={BASE + 18} textAnchor="middle" className={`${s.tick} ${i % 2 ? s.tickOdd : ''}`}>{label.day}</text>
              <text x={i * slot + slot / 2} y={BASE + 34} textAnchor="middle" className={`${s.tick} ${i % 2 ? s.tickOdd : ''}`}>{label.month}</text>
            </g>
          );
        })}
      </svg>
      <details className={s.details}>
        <summary>Show the figures as a table</summary>
        <Table label="Emails sent and replies per week">
          <thead>
            <tr><th>Week starting</th><th className={tableCell.num}>Sent</th><th className={tableCell.num}>Replies</th></tr>
          </thead>
          <tbody>
            {weekly.map((w) => {
              const label = weekLabel(w.week_start);
              return (
                <tr key={w.week_start}>
                  <td>{label.day} {label.month} {w.week_start.slice(0, 4)}</td>
                  <td className={tableCell.num}>{formatCount(w.sent)}</td>
                  <td className={tableCell.num}>{formatCount(w.replies)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </details>
    </div>
  );
}
