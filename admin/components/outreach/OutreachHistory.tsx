// The emails written to or about one creator ("creator") or one sponsor ("brand"): subject, status, date, link.
// Server component, renders its own section. Read with the user's client, so row security applies. No addresses are shown.
import Link from 'next/link';
import { Badge, Notice } from '@/components/ui';
import { STATUS_LABEL, STATUS_TONE } from '@/app/(company)/emails/status';
import { formatWhen } from '@/lib/deals/format';
import { createClient } from '@/lib/supabase/server';

type Row = { id: string; subject: string; status: string; is_test: boolean; created_at: string; sent_at: string | null };

export async function OutreachHistory({ side, id }: { side: 'creator' | 'brand'; id: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('emails')
    .select('id, subject, status, is_test, created_at, sent_at')
    .eq(side === 'creator' ? 'creator_id' : 'brand_id', id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    return (
      <section className="panel-sec" aria-label="Outreach history">
        <h3>Outreach history</h3>
        <Notice tone="error">The emails could not be loaded. Refresh the page to try again.</Notice>
      </section>
    );
  }
  const rows = (data ?? []) as Row[];
  return (
    <section className="panel-sec" aria-label="Outreach history">
      <h3>Outreach history</h3>
      {rows.length === 0 ? <p className="muted">Nobody has written to them yet.</p> : rows.map((e) => (
        <div key={e.id} className="person">
          <Link href={`/emails/${e.id}`}>{e.subject || '(no subject)'}</Link>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{e.status === 'draft' ? 'Draft, not sent' : (STATUS_LABEL[e.status] ?? e.status)}</Badge>
            {e.is_test ? <Badge>Test</Badge> : null}
            <span className="muted">{formatWhen(e.sent_at ?? e.created_at)}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
