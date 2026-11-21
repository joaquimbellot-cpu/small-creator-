import { AppShell } from '@/components/shell/AppShell';
import { requireStaff } from '@/lib/auth/staff';

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <AppShell staff={staff}>{children}</AppShell>;
}
