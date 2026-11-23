import type { Metadata } from 'next';
import { Badge, ConfirmButton, Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { EnrollPanel } from './EnrollPanel';
import { removeFactorAction } from './actions';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return <Notice tone="error">Could not load your two-step login settings. Refresh to try again.</Notice>;
  const verified = data?.totp?.find((f) => f.status === 'verified');
  return (
    <section style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Two-step login <Badge tone={verified ? 'good' : 'neutral'}>{verified ? 'On' : 'Off'}</Badge></h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Optional. When it is on, logging in also needs a 6-digit code from an authenticator app on your phone.
      </p>
      {verified ? (
        <form action={removeFactorAction}>
          <input type="hidden" name="factorId" value={verified.id} />
          <ConfirmButton variant="danger" size="md" title="Turn off two-step login?" message="Logging in will need only your password again." confirmLabel="Turn off">Turn off</ConfirmButton>
        </form>
      ) : (
        <EnrollPanel />
      )}
    </section>
  );
}
