import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth/staff';

export default async function SettingsIndex() {
  const staff = await requireStaff();
  // A worker has only the Security page.
  redirect(staff.role === 'owner' ? '/settings/users' : '/settings/security');
}
