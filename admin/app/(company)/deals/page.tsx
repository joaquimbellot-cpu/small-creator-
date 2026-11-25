import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, EmptyState, Notice, Pagination, Select, Table, tableCell } from '@/components/ui';
import { DraftPitchButton } from '@/components/outreach/DraftPitchButton';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { STAGES, STAGE_LABEL, formatUsd, formatWhen, type Stage } from '@/lib/deals/format';
import { stageSchema } from '@/lib/deals/schemas';
import { AddDealForm } from './AddDealForm';
import { AmountEditor } from './AmountEditor';
import { DealsBoard, type BoardDeal } from './DealsBoard';
import { StageForm } from './StageForm';
import { DeleteDealForm } from './DeleteDealForm';
import { ViewSwitch } from './ViewSwitch';
import s from './deals.module.css';

export const metadata: Metadata = { title: 'Deals' };

const PAGE_SIZE = 25;
const LIST_LIMIT = 1000; // the creator and brand lists for the Add form stop here
const BOARD_LIMIT = 2000; // newest deals on the board; each column then shows 50 and a "Show more" button

function one(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : undefined;
}

type DealRow = {
  id: string;
  stage: Stage;
  amount_cents: number | null;
  commission_cents: number;
  stage_changed_at: string;
  creator_id: string;
  brand_id: string;
  creators: { full_name: string } | null;
  brands: { name: string } | null;
};
const COLUMNS = 'id, stage, amount_cents, commission_cents, stage_changed_at, creator_id, brand_id, creators (full_name), brands (name)';

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const view = one(sp.view) === 'table' ? 'table' : 'board';
  const page = Math.max(1, parseInt(one(sp.page) ?? '1', 10) || 1);
  const parsedStage = stageSchema.safeParse(one(sp.stage));
  const stage = view === 'table' && parsedStage.success ? parsedStage.data : undefined;

  const supabase = await createClient();
  let q = supabase.from('deals').select(COLUMNS, { count: 'exact' });
  if (stage) q = q.eq('stage', stage);
  q = q.order('stage_changed_at', { ascending: false }).order('id');
  q = view === 'board' ? q.range(0, BOARD_LIMIT - 1) : q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const [{ data, count, error }, { data: creators, error: creatorsError }, { data: brands, error: brandsError }] = await Promise.all([
    q,
    supabase.from('creators').select('id, full_name').order('full_name').limit(LIST_LIMIT),
    supabase.from('brands').select('name').order('name').limit(LIST_LIMIT),
  ]);
  const rows = (data ?? []) as unknown as DealRow[];

  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (view === 'table') u.set('view', 'table');
    if (stage) u.set('stage', stage);
    if (p > 1) u.set('page', String(p));
    const t = u.toString();
    return `/deals${t ? `?${t}` : ''}`;
  };

  // A page number past the end (an old bookmark, or the last row was deleted): go to the last page.
  if (view === 'table' && page > 1 && (error?.code === 'PGRST103' || (!error && rows.length === 0))) {
    let head = supabase.from('deals').select('id', { count: 'exact', head: true });
    if (stage) head = head.eq('stage', stage);
    const { count: total } = await head;
    const last = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
    if (last < page) redirect(hrefFor(last));
  }

  const addForm = (
    <AddDealForm
      creators={(creators ?? []) as { id: string; full_name: string }[]}
      brands={(brands ?? []).map((b) => String(b.name))}
    />
  );
  const notices = (
    <>
      {creatorsError || brandsError ? <Notice tone="error">The creator or brand list for the Add form could not be loaded. Refresh the page to try again.</Notice> : null}
      {(creators ?? []).length >= LIST_LIMIT || (brands ?? []).length >= LIST_LIMIT ? (
        <Notice tone="warn">There are 1,000 or more creators or brands. The Add form lists only the first 1,000 (A to Z), so a deal for a creator further down the list cannot be added here yet.</Notice>
      ) : null}
    </>
  );

  const head = (
    <div className="page-head">
      <div>
        <h1 className="page-title">Deals</h1>
        <p className="page-lead">A link between a creator and a sponsor starts on the left and moves right as it progresses.</p>
      </div>
      <ViewSwitch view={view} />
    </div>
  );

  if (view === 'board') {
    const deals: BoardDeal[] = rows.map((d) => ({
      id: d.id, stage: d.stage, amount_cents: d.amount_cents == null ? null : Number(d.amount_cents), stage_changed_at: d.stage_changed_at,
      creator_id: d.creator_id, creator: d.creators?.full_name ?? 'Unknown creator', brand_id: d.brand_id, brand: d.brands?.name ?? 'Unknown brand',
    }));
    // The pitch button comes from the Outreach agent (a client component), so the server hands the board ready-made buttons.
    const drafts = Object.fromEntries(deals.filter((d) => d.stage === 'matched' || d.stage === 'contacted')
      .map((d) => [d.id, <DraftPitchButton key={d.id} creatorId={d.creator_id} brandId={d.brand_id} size="sm" label="Draft pitch" />]));
    return (
      <>
        {head}
        {notices}
        {error ? <Notice tone="error">Deals could not be loaded. Refresh the page to try again.</Notice> : (
          <>
            {(count ?? 0) > BOARD_LIMIT ? <Notice tone="warn">The board shows the newest {BOARD_LIMIT.toLocaleString('en-US')} of {(count ?? 0).toLocaleString('en-US')} deals. Use the table to see all of them.</Notice> : null}
            <details className={s.addBox}>
              <summary>Add a deal</summary>
              {addForm}
            </details>
            <DealsBoard deals={deals} now={new Date().toISOString()} drafts={drafts} />
          </>
        )}
      </>
    );
  }

  return (
    <>
      {head}
      {notices}
      <div className="split split--wide">
        <section>
          <form method="get" className="toolbar">
            <input type="hidden" name="view" value="table" />
            <Select label="Stage" name="stage" defaultValue={stage ?? ''}>
              <option value="">All stages</option>
              {STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
            </Select>
            <Button type="submit" variant="ghost">Filter</Button>
          </form>

          {error ? <Notice tone="error">Deals could not be loaded. Refresh the page to try again.</Notice> : rows.length === 0 ? (
            <EmptyState title={stage ? `No deals at ${STAGE_LABEL[stage].toLowerCase()}` : 'No deals yet'}>
              {stage ? 'Try another stage, or clear the filter.' : 'Add the first one with the form.'}
            </EmptyState>
          ) : (
            <Table label="Deals">
              <thead>
                <tr>
                  <th>Creator</th><th>Brand</th><th>Stage</th>
                  <th className={tableCell.num}>Amount</th><th className={tableCell.num}>Commission</th><th>Last change (UTC)</th>
                  <th className={tableCell.actions}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const creator = d.creators?.full_name ?? 'Unknown creator';
                  const brand = d.brands?.name ?? 'Unknown brand';
                  const cents = d.amount_cents == null ? null : Number(d.amount_cents);
                  return (
                    <tr key={d.id}>
                      <td><Link href={`/creators/${d.creator_id}`} prefetch={false} className={s.nameLink}>{creator}</Link></td>
                      <td><Link href={`/sponsors/${d.brand_id}`} prefetch={false} className={s.nameLink}>{brand}</Link></td>
                      <td><StageForm id={d.id} stage={d.stage} label={`Stage for the ${brand} deal with ${creator}`} /></td>
                      <td className={tableCell.num}><AmountEditor id={d.id} cents={cents} who={`the ${brand} deal with ${creator}`} emptyText="Not set" /></td>
                      <td className={tableCell.num}>{cents == null ? <span className="muted">–</span> : formatUsd(d.commission_cents)}</td>
                      <td>{formatWhen(d.stage_changed_at)}</td>
                      <td className={tableCell.actions}>
                        {staff.role === 'owner' ? <DeleteDealForm id={d.id} brand={brand} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {rows.length > 0 || page > 1 ? (
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} />
          ) : null}
        </section>

        <aside>{addForm}</aside>
      </div>
    </>
  );
}
