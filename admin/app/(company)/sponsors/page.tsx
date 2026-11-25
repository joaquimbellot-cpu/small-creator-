import { redirect } from 'next/navigation';
import { buttonClass, LinkButton } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { chipsFromParams, removeChip } from '@/lib/lists/query';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, countryName, type FacetCounts, type SponsorRow } from '@/lib/sponsors/constants';
import { detectedMatters, filterDefs, filtersToParams, parseFilters } from '@/lib/sponsors/filters';
import { countSponsors, loadFacets, loadList, loadTags, loadViews, totalSponsors, type SavedView, type Tag } from '@/lib/sponsors/queries';
import { SponsorProfile } from './profile/SponsorProfile';
import { SponsorDialog } from './SponsorDialog';
import { SponsorsList, type Relax } from './SponsorsList';

export const metadata = { title: 'Sponsors' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const supabase = await createClient();

  let rows: SponsorRow[] = [];
  let total = 0;
  let all = 0;
  let counts: FacetCounts = {};
  let tags: Tag[] = [];
  let views: SavedView[] = [];
  let loadFailed = false;
  try {
    const [list, facets, count, tagList, viewList] = await Promise.all([
      loadList(supabase, f), loadFacets(supabase, f), totalSponsors(supabase), loadTags(supabase), loadViews(supabase, staff.id),
    ]);
    ({ rows, total } = list);
    counts = facets; all = count; tags = tagList; views = viewList;
    // A page number past the end gives no rows: go to the last page.
    if (f.page > 1 && rows.length === 0) {
      const n = await countSponsors(supabase, f);
      if (n > 0) {
        const p = filtersToParams({ ...f, page: Math.ceil(n / PAGE_SIZE) });
        redirect(`/sponsors?${p.toString()}`);
      }
    }
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
    console.error('sponsors list failed', e instanceof Error ? e.message : (e as { code?: string })?.code);
    loadFailed = true;
  }

  // Empty state: which single filters, once removed, bring results back (up to three).
  const relax: Relax[] = [];
  if (!loadFailed && rows.length === 0 && all > 0) {
    const defs = filterDefs((id) => tags.find((t) => t.id === id)?.name ?? 'Unknown tag');
    const clean = filtersToParams(f);
    const chips = chipsFromParams(clean, defs).filter((c) => c.key !== 'detected' || detectedMatters(clean));
    const found = await Promise.all(chips.map(async (chip) => {
      const next = parseFilters(removeChip(clean, chip, defs));
      try { return { chipId: chip.id, label: chip.label, n: await countSponsors(supabase, next) }; } catch { return { chipId: chip.id, label: chip.label, n: 0 }; }
    }));
    relax.push(...found.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3));
  }

  const industries = Object.keys(counts.industry ?? {}).sort((a, b) => a.localeCompare(b));
  const countries = Object.keys(counts.country ?? {}).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const exportQs = filtersToParams({ ...f, page: 1, open: null }).toString();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sponsors</h1>
          <p className="page-lead">Brands that sponsor creators, who they like to work with, and who to talk to.</p>
        </div>
        <div className="list-row">
          <SponsorDialog mode="add" label="Add sponsor" />
          <LinkButton href="/sponsors/import" variant="ghost">Import CSV</LinkButton>
          {staff.role === 'owner' ? <a href={`/api/sponsors/export${exportQs ? `?${exportQs}` : ''}`} className={buttonClass({ variant: 'ghost' })}>Export CSV</a> : null}
        </div>
      </div>
      <SponsorsList
        rows={rows} total={total} all={all} page={f.page} counts={counts} industries={industries} countries={countries} tags={tags} views={views}
        now={new Date().toISOString()} loadFailed={loadFailed} relax={relax} openId={f.open}
        panel={f.open ? <SponsorProfile id={f.open} mode="panel" /> : null}
      />
    </>
  );
}
