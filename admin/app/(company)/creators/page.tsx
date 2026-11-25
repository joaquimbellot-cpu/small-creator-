import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { LinkButton, buttonClass } from '@/components/ui';
import { logAudit } from '@/lib/audit';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, type ListRow } from '@/lib/creators/constants';
import { filtersToQuery, parseFilters, type Filters } from '@/lib/creators/filters';
import { loadFacets, loadOptionNames, loadPage, loadRelax, type Relax } from '@/lib/creators/query';
import { youtubeEnabled } from '@/lib/youtube';
import { CreatorProfile } from './profile/CreatorProfile';
import { CreatorDialog } from './CreatorDialog';
import { CreatorsList } from './CreatorsList';
import { CreatorsSubnav } from './CreatorsSubnav';
import { languageName, regionName } from './list-format';
import type { SavedView } from './CreatorsToolbar';

export const metadata = { title: 'Creators' };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const supabase = await createClient();

  const link = (over: Partial<Filters> & { creator?: string; edit?: boolean; isNew?: boolean } = {}) => `/creators${filtersToQuery({ ...f, ...over })}`;

  // Rows, the counts beside every option, and the names of sponsors, tags and lists: three independent questions.
  let rows: ListRow[] = [];
  let total = 0;
  let all = 0;
  let counts: Record<string, Record<string, number>> = {};
  let options = { brands: [], tags: [], lists: [] } as Awaited<ReturnType<typeof loadOptionNames>>;
  let savedViews: SavedView[] = [];
  let failed = false;
  try {
    const [pageRes, facets, names, views] = await Promise.all([
      loadPage(supabase, f), loadFacets(supabase, f), loadOptionNames(supabase),
      supabase.from('saved_views').select('id, owner_id, name, query, is_shared').eq('scope', 'creators').order('name').limit(200),
    ]);
    if (views.error) throw views.error;
    rows = pageRes.rows;
    total = facets.total;
    all = facets.all;
    counts = facets.counts;
    options = names;
    savedViews = (views.data ?? []) as SavedView[];
  } catch (e) {
    console.error('creators: list failed', (e as { code?: string })?.code ?? e);
    failed = true;
  }

  // A page number past the end gives no rows: go to the last page.
  if (!failed && f.page > 1 && rows.length === 0 && total > 0) {
    redirect(link({ page: Math.max(1, Math.ceil(total / PAGE_SIZE)) }));
  }

  const names = {
    ...options,
    langs: Object.fromEntries(Object.keys(counts.lang ?? {}).map((c) => [c, languageName(c)])),
    countries: Object.fromEntries(Object.keys(counts.country ?? {}).map((c) => [c, regionName(c)])),
  };

  // Empty result with filters on: which single filter, once removed, brings results back.
  let relax: Relax[] = [];
  if (!failed && rows.length === 0 && total === 0) {
    relax = await loadRelax(supabase, f, {
      brands: Object.fromEntries(options.brands.map((b) => [b.id, b.name])),
      tags: Object.fromEntries(options.tags.map((t) => [t.id, t.name])),
      lists: Object.fromEntries(options.lists.map((l) => [l.id, l.name])),
      langs: (c) => names.langs[c] ?? c,
      countries: (c) => names.countries[c] ?? c,
    }).catch(() => []);
  }

  // The side panel: the profile is a shared slot (built by the Creator profile agent) and renders its own audit line.
  let panel: React.ReactNode = null;
  let openName = '';
  if (f.open) {
    const known = rows.find((r) => r.id === f.open);
    if (known) openName = known.full_name;
    else {
      const { data } = await supabase.from('creators').select('full_name').eq('id', f.open).maybeSingle();
      openName = data?.full_name ?? '';
    }
    panel = openName ? <CreatorProfile id={f.open} mode="panel" /> : <p className="muted">This creator no longer exists.</p>;
  }

  // Add (?new=1) and edit (?creator=<id>&edit=1) keep the dialog; ?creator=<id> alone is an old link and opens the panel.
  const creatorParam = z.guid().safeParse(first(sp.creator));
  const isNew = first(sp.new) === '1';
  const wantsEdit = first(sp.edit) === '1';
  let dialog: React.ReactNode = null;
  if (isNew || (creatorParam.success && wantsEdit)) {
    let editInitial: Record<string, string> | null = null;
    if (creatorParam.success && wantsEdit && !isNew) {
      const { data: c } = await supabase.from('creators').select('*').eq('id', creatorParam.data).maybeSingle();
      if (!c) notFound();
      await logAudit('creator.viewed', 'creator', c.id, { label: c.full_name });
      editInitial = {
        name: c.full_name, email: c.email, phone: c.phone ?? '', channel_url: c.channel_url ?? '', niche: c.niche ?? '',
        subscribers: c.subscribers == null ? '' : String(c.subscribers), status: c.status, notes: c.notes ?? '',
      };
    }
    const id = creatorParam.success ? creatorParam.data : undefined;
    dialog = (
      <CreatorDialog
        key={`${id ?? 'new'}-${isNew ? 'new' : 'edit'}`}
        mode={isNew ? 'new' : 'edit'}
        creatorId={isNew ? undefined : id}
        editInitial={editInitial}
        listHref={link()}
        viewHref={link({ open: id })}
        editHref={link({ creator: id, edit: true })}
        back={filtersToQuery(f)}
        isOwner={staff.role === 'owner'}
        youtubeEnabled={youtubeEnabled()}
      />
    );
  }

  const exportQs = filtersToQuery({ ...f, page: 1, open: '' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Creators</h1>
          <p className="page-lead">Find channels by size, niche and what they have done with sponsors before.</p>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <LinkButton href={link({ isNew: true, open: '' })}>Add creator</LinkButton>
          <LinkButton href="/creators/import" variant="ghost">Import CSV</LinkButton>
          {staff.role === 'owner' ? <a href={`/api/creators/export${exportQs}`} className={buttonClass({ variant: 'ghost' })}>Export CSV</a> : null}
        </div>
      </div>
      <CreatorsSubnav />
      <CreatorsList
        rows={rows} total={total} all={all} counts={counts} names={names} savedViews={savedViews} staffId={staff.id}
        youtubeEnabled={youtubeEnabled()} relax={relax} panel={panel} panelFor={f.open} openName={openName} failed={failed}
      />
      {dialog}
    </>
  );
}
