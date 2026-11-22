// The frame around every company page: brand, navigation, user name and role, logout.
import Link from 'next/link';
import { logoutAction } from '@/lib/auth/actions';
import type { Staff } from '@/lib/auth/staff';
import { NavLinks } from './NavLinks';

export function AppShell({ staff, children }: { staff: Staff; children: React.ReactNode }) {
  const items = [
    { href: '/overview', label: 'Overview' },
    { href: '/creators', label: 'Creators' },
    { href: '/deals', label: 'Deals' },
    { href: '/emails', label: 'Emails' },
    { href: '/inbox', label: 'Inbox' },
    ...(staff.role === 'owner' ? [{ href: '/claude', label: 'Claude' }] : []),
    ...(staff.role === 'owner' ? [{ href: '/settings', label: 'Settings' }] : []),
  ];
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="shell__bar">
        <div className="shell__inner">
          <Link href="/overview" className="shell__brand">Smallfold</Link>
          <NavLinks items={items} className="shell__nav" />
          <div className="shell__user">
            <div className="shell__who">
              {staff.fullName}
              <small>{staff.role}</small>
            </div>
            <form action={logoutAction} className="inline-form">
              <button type="submit" className="label" style={{ background: 'none', border: 0, cursor: 'pointer', minHeight: 44, padding: '0 8px', textDecoration: 'underline' }}>
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="shell__main">{children}</main>
    </div>
  );
}
