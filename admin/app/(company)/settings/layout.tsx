import { NavLinks } from '@/components/shell/NavLinks';
import { requireOwner } from '@/lib/auth/staff';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <>
      <div className="page-head"><h1 className="page-title">Settings</h1></div>
      <NavLinks
        label="Settings"
        className="subnav"
        items={[
          { href: '/settings/users', label: 'Users' },
          { href: '/settings/security', label: 'Security' },
          { href: '/settings/audit', label: 'Audit log' },
          { href: '/settings/sending', label: 'Sending' },
        ]}
      />
      {children}
    </>
  );
}
