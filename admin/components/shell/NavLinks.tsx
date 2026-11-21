'use client';
// Main navigation (client component only to mark the current page).
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };

export function NavLinks({ items, label = 'Main', className }: { items: NavItem[]; label?: string; className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className={className}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href || path.startsWith(i.href + '/') ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
