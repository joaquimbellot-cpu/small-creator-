// Sub-navigation for the email section. Each page checks the login itself (requireStaff).
import { NavLinks } from '@/components/shell/NavLinks';

export default function EmailsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="page-head"><h1 className="page-title">Emails</h1></div>
      <NavLinks
        label="Emails"
        className="subnav"
        items={[
          { href: '/emails/compose', label: 'Compose' },
          { href: '/emails/review', label: 'Review' },
          { href: '/emails/templates', label: 'Templates' },
          { href: '/emails', label: 'Log' },
        ]}
      />
      {children}
    </>
  );
}
