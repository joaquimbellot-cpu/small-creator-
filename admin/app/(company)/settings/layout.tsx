import { NavLinks } from '@/components/shell/NavLinks';
import { requireStaff } from '@/lib/auth/staff';

// Every staff member may open Settings to manage their own two-step login; only the owner sees the other tabs.
// The owner-only pages check requireOwner() themselves (a page must never rely on this layout alone).
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const items = staff.role === 'owner'
    ? [
        { href: '/settings/users', label: 'Users' },
        { href: '/settings/security', label: 'Security' },
        { href: '/settings/audit', label: 'Audit log' },
        { href: '/settings/sending', label: 'Sending' },
      ]
    : [{ href: '/settings/security', label: 'Security' }];
  return (
    <>
      <div className="page-head"><h1 className="page-title">Settings</h1></div>
      <NavLinks label="Settings" className="subnav" items={items} />
      {children}
    </>
  );
}
