import type { Metadata } from 'next';
import { EmptyState, Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { STAGES, STAGE_LABEL, formatCount, formatUsd, formatWhen } from '@/lib/deals/format';
import type { ActivityRow, Overview } from '@/lib/deals/stats';
import { WeeklyChart } from './WeeklyChart';
import s from './Overview.module.css';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const { notice } = await searchParams;
  const supabase = await createClient();
  const [{ data: stats, error: statsError }, { data: activity, error: activityError }] = await Promise.all([
    supabase.rpc('stats_overview'),
    supabase.rpc('recent_activity', { p_limit: 20 }),
  ]);
  const o = stats as Overview | null;

  return (
    <>
      <div className="page-head"><h1 className="page-title">Overview</h1></div>
      {notice === 'owner-only' ? <Notice tone="info">Only the owner can open that page.</Notice> : null}
      <div className="split">
        <div>
          {statsError || !o ? (
            <Notice tone="error">The numbers could not be loaded. Refresh the page to try again.</Notice>
          ) : (
            <>
              <section className={s.cards} aria-label="Key numbers">
                <Card label="Total creators" value={formatCount(o.total_creators)} />
                <Card label="Emails sent" value={formatCount(o.emails_sent_all)} note={`${formatCount(o.emails_sent_7d)} in the last 7 days · ${formatCount(o.emails_sent_30d)} in the last 30`} />
                <Card label="Replies" value={<>{formatCount(o.replies)} <span className={s.unit}>replies · {Number(o.reply_rate).toFixed(1)}%</span></>} note="Reply rate is replies divided by emails sent." />
                <Card label="Active deals" value={formatCount(o.active_deals)} note="Negotiating, signed or completed, not yet paid." />
                <Card label="Commission earned" value={formatUsd(o.commission_earned_cents)} note="On deals marked paid." />
                <Card label="Failed sends, last 7 days" value={formatCount(o.emails_failed_7d ?? 0)} note={Number(o.emails_failed_7d ?? 0) > 0 ? 'Open the Emails log and filter by Failed to see them.' : 'Emails that could not be delivered.'} />
              </section>

              <section className={s.block} aria-labelledby="stages-title">
                <h2 id="stages-title" className={`label ${s.blockTitle}`}>Deals by stage</h2>
                <dl className={s.stages}>
                  {STAGES.map((stage) => (
                    <div key={stage} className={s.stage}>
                      <dt>{STAGE_LABEL[stage]}</dt>
                      <dd>{formatCount(o.deals_by_stage[stage])}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className={s.block} aria-labelledby="chart-title">
                <h2 id="chart-title" className={`label ${s.blockTitle}`}>Emails and replies, last 12 weeks</h2>
                <WeeklyChart weekly={o.weekly ?? []} />
              </section>
            </>
          )}
        </div>

        <aside className={s.block} aria-labelledby="activity-title">
          <h2 id="activity-title" className={`label ${s.blockTitle}`}>Recent activity (times are UTC)</h2>
          {activityError ? (
            <Notice tone="error">Activity could not be loaded.</Notice>
          ) : (activity ?? []).length === 0 ? (
            <EmptyState title="Nothing yet">Changes to creators, deals and emails will show up here.</EmptyState>
          ) : (
            <ul className={s.activity}>
              {(activity as ActivityRow[]).map((row, i) => (
                <li key={`${row.created_at}-${i}`}>
                  <span>{row.actor_name} {row.summary}</span>
                  <time dateTime={row.created_at} className="muted">{formatWhen(row.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

function Card({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className={`tile ${s.card}`}>
      <div className="label">{label}</div>
      <div className={s.value}>{value}</div>
      {note ? <p className={`muted ${s.note}`}>{note}</p> : null}
    </div>
  );
}
