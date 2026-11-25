// The full creator page: /creators/<id>. The same profile as the side panel, in two columns.
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff';
import { CreatorProfile, loadCreator } from '../profile/CreatorProfile';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireStaff(); // before anything is read: a title must not reveal a name to a non-staff visitor
  const { id } = await params;
  const c = await loadCreator(id); // shared with the page body: one read per request
  return { title: c ? c.full_name : 'Creator' };
}

export default async function CreatorPage({ params }: Props) {
  await requireStaff();
  const { id } = await params;
  return (
    <>
      <p style={{ marginBottom: 'var(--s-4)' }}><Link href="/creators">← Back to creators</Link></p>
      <CreatorProfile id={id} mode="page" />
    </>
  );
}
