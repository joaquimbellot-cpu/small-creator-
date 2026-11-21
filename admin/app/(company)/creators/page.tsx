import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Button, EmptyState, Input, LinkButton, Pagination, Select, buttonClass } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, STATUSES, STATUS_LABEL, type ListRow } from '@/lib/creators/constants';
import { filtersToQuery, parseFilters, type Filters, type SortKey } from '@/lib/creators/filters';
import { applyFilters } from '@/lib/creators/query';
import { CreatorDialog } from './CreatorDialog';
import { CreatorsTable, type SortCol } from './CreatorsTable';

export const metadata = { title: 'Creators' };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const supabase = await createClient();

  const { data, count, error } = await applyFilters(
    supabase.from('creator_summaries').select('*', { count: 'exact' }), f,
  ).range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  const total = count ?? 0;
  if (error && !(f.page > 1)) throw error;
  const rows = (data ?? []) as ListRow[];

  const link = (over: Partial<Filters> & { creator?: string; edit?: boolean; isNew?: boolean } = {}) => `/creators${filtersToQuery({ ...f, ...over })}`;
  const sortCol = (key: SortKey): SortCol => {
    const active = f.sort === key ? f.dir : false;
    const dir = f.sort === key ? (f.dir === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc';
    return { href: link({ sort: key, dir, page: 1 }), active };
  };
  const sorts = { name: sortCol('name'), subscribers: sortCol('subscribers'), last_contacted: sortCol('last_contacted'), added: sortCol('added') };

  const creatorParam = z.guid().safeParse(first(sp.creator));
  const isNew = first(sp.new) === '1';
  const wantsEdit = first(sp.edit) === '1';
  let dialog: React.ReactNode = null;
  if (isNew || creatorParam.success) {
    let editInitial: Record<string, string> | null = null;
    if (creatorParam.success && wantsEdit && !isNew) {
      const { data: c } = await supabase.from('creators').select('*').eq('id', creatorParam.data).maybeSingle();
      if (!c) notFound();
      editInitial = {
        name: c.full_name, email: c.email, phone: c.phone ?? '', channel_url: c.channel_url ?? '', niche: c.niche ?? '',
        subscribers: c.subscribers == null ? '' : String(c.subscribers), status: c.status, notes: c.notes ?? '',
      };
    }
    const id = creatorParam.success ? creatorParam.data : undefined;
    dialog = (
      <CreatorDialog
        key={`${id ?? 'new'}-${isNew ? 'new' : wantsEdit ? 'edit' : 'view'}`}
        mode={isNew ? 'new' : wantsEdit ? 'edit' : 'view'}
        creatorId={isNew ? undefined : id}
        editInitial={editInitial}
        listHref={link()}
        viewHref={link({ creator: id })}
        editHref={link({ creator: id, edit: true })}
        back={filtersToQuery(f)}
        isOwner={staff.role === 'owner'}
        youtubeEnabled={!!process.env.YOUTUBE_API_KEY?.trim()}
      />
    );
  }

  const withHref = rows.map((r) => ({ ...r, href: link({ creator: r.id }) }));
  const exportQs = filtersToQuery({ ...f, page: 1 });
  const filtered = !!(f.q || f.status);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Creators</h1>
          <p className="page-lead">{total} {filtered ? 'matching' : 'in total'}. Smallfold works with channels of 1,000 to 50,000 subscribers.</p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <LinkButton href={link({ isNew: true })}>Add creator</LinkButton>
          <LinkButton href="/creators/import" variant="ghost">Import CSV</LinkButton>
          {staff.role === 'owner' ? <a href={`/api/creators/export${exportQs}`} className={buttonClass({ variant: 'ghost' })}>Export CSV</a> : null}
        </div>
      </div>

      <form method="get" action="/creators" className="toolbar" role="search">
        <Input name="q" label="Search" type="search" placeholder="Name, email or channel" defaultValue={f.q} maxLength={100} />
        <Select name="status" label="Status" defaultValue={f.status}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <input type="hidden" name="sort" value={f.sort} />
        <input type="hidden" name="dir" value={f.dir} />
        <Button type="submit">Apply</Button>
        {filtered ? <LinkButton href="/creators" variant="ghost">Clear</LinkButton> : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? 'No creators match' : 'No creators yet'} action={filtered ? <LinkButton href="/creators" variant="ghost">Clear filters</LinkButton> : <LinkButton href={link({ isNew: true })}>Add the first creator</LinkButton>}>
          {filtered ? 'Try a different search or status.' : 'Add one by hand or import a CSV file.'}
        </EmptyState>
      ) : (
        <CreatorsTable rows={withHref} sorts={sorts} youtubeEnabled={!!process.env.YOUTUBE_API_KEY?.trim()} />
      )}
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => link({ page: p })} />
      {dialog}
    </>
  );
}
