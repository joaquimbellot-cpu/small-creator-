import type { Metadata } from 'next';
import { Notice } from '@/components/ui';
import { requireOwner } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { SendingForm } from './SendingForm';

export const metadata: Metadata = { title: 'Sending' };

export default async function SendingPage() {
  await requireOwner(); // the settings layout checks too; every page checks again
  const supabase = await createClient();
  const { data: s } = await supabase.from('settings').select('*').eq('id', 1).single();
  if (!s) return <Notice tone="error">Settings could not be loaded.</Notice>;

  // Today's count, the same way the database counts it: this mode's sends since midnight in the settings time zone.
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: s.timezone });
  const { data: recent } = await supabase
    .from('emails')
    .select('sent_at, updated_at')
    .in('status', ['sending', 'sent', 'replied'])
    .eq('is_test', s.test_mode)
    .gte('updated_at', new Date(Date.now() - 36 * 3600 * 1000).toISOString());
  const today = day(new Date());
  const count = (recent ?? []).filter((r) => day(new Date(r.sent_at ?? r.updated_at)) === today).length;

  return (
    <>
      <p className="page-lead">
        Sent today ({s.test_mode ? 'test' : 'real'}): <strong>{count}</strong> of {s.daily_send_limit}. Gmail allows about 500 emails a day, and may flag sudden bursts of cold email.
      </p>
      <SendingForm s={s} />
    </>
  );
}
