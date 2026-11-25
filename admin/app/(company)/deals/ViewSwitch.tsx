'use client';
// Board or Table, kept in the address (view=table). The board is the default and leaves no key in the address.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Segmented } from '@/components/ui';

export function ViewSwitch({ view }: { view: 'board' | 'table' }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <Segmented
      inline label="View" name="dealview" value={view}
      options={[{ value: 'board', label: 'Board' }, { value: 'table', label: 'Table' }]}
      onChange={(v) => {
        const p = new URLSearchParams(params.toString());
        p.delete('page');
        if (v === 'table') p.set('view', 'table'); else { p.delete('view'); p.delete('stage'); }
        const q = p.toString();
        router.replace(q ? `${path}?${q}` : path, { scroll: false });
      }}
    />
  );
}
