'use client';
// Main navigation (client component only to mark the current page).
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };

export function NavLinks({ items, label = 'Main', className }: { items: NavItem[]; label?: string; className?: string }) {
  const path = usePathname();
  // Only the closest match is current: on /emails/compose that is "Compose", not also "Log" (/emails).
  const matches = items.filter((i) => path === i.href || path.startsWith(i.href + '/'));
  const current = matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
  // prefetch off: each prefetched link is a full server render with a session check.
  return (
    <nav aria-label={label} className={className}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} prefetch={false} aria-current={i.href === current ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
