import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/sponsors/filters';
import { SponsorProfile } from '../profile/SponsorProfile';
import s from '../sponsors.module.css';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: 'Sponsor' };
  const supabase = await createClient();
  const { data } = await supabase.from('brands').select('name').eq('id', id).maybeSingle();
  return { title: data?.name ? String(data.name) : 'Sponsor' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return (
    <>
      <Link href="/sponsors" className={s.back}>Back to sponsors</Link>
      <SponsorProfile id={id} mode="page" />
    </>
  );
}
