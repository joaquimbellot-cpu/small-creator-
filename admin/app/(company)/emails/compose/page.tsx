import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { creatorsByIds } from '@/lib/email/creators';
import { isMockMode } from '@/lib/drafting';
import { ComposeForm } from './ComposeForm';

export const metadata: Metadata = { title: 'Compose' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /emails/compose?creators=<id>,<id>  preselects creators (the creators page links here).
export default async function ComposePage({ searchParams }: { searchParams: Promise<{ creators?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const ids = (sp.creators ?? '').split(',').filter((id) => UUID.test(id)).slice(0, 25);
  const supabase = await createClient();
  const { data: templates } = await supabase.from('email_templates').select('id, name').order('name');
  return (
    <>
      <p className="page-lead" style={{ marginBottom: 'var(--s-5)' }}>Pick creators, then choose a template or describe the goal in one sentence. Nothing is sent from here: drafts go to Review.</p>
      <ComposeForm initial={await creatorsByIds(supabase, ids)} templates={templates ?? []} mock={isMockMode()} />
    </>
  );
}
