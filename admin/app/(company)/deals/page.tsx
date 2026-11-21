import type { Metadata } from 'next';
import { Button, ConfirmButton, EmptyState, Pagination, Select, Table, tableCell } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { STAGES, STAGE_LABEL, formatUsd, formatWhen, type Stage } from '@/lib/deals/format';
import { stageSchema } from '@/lib/deals/schemas';
import { AddDealForm } from './AddDealForm';
import { StageForm } from './StageForm';
import { deleteDealAction } from './actions';

export const metadata: Metadata = { title: 'Deals' };

const PAGE_SIZE = 25;

function one(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : undefined;
}

type DealRow = {
  id: string;
  stage: Stage;
  amount_cents: number;
  commission_cents: number;
  stage_changed_at: string;
  creators: { full_name: string } | null;
  brands: { name: string } | null;
};

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(one(sp.page) ?? '1', 10) || 1);
  const parsedStage = stageSchema.safeParse(one(sp.stage));
  const stage = parsedStage.success ? parsedStage.data : undefined;

  const supabase = await createClient();
  let q = supabase
    .from('deals')
    .select('id, stage, amount_cents, commission_cents, stage_changed_at, creators (full_name), brands (name)', { count: 'exact' });
  if (stage) q = q.eq('stage', stage);
  const [{ data, count, error }, { data: creators }, { data: brands }] = await Promise.all([
    q.order('stage_changed_at', { ascending: false }).order('id').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from('creators').select('id, full_name').order('full_name').limit(1000),
    supabase.from('brands').select('name').order('name').limit(1000),
  ]);
  const rows = (data ?? []) as unknown as DealRow[];

  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (stage) u.set('stage', stage);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return `/deals${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="page-head"><h1 className="page-title">Deals</h1></div>
      <div className="split">
        <section>
          <form method="get" className="toolbar">
            <Select label="Stage" name="stage" defaultValue={stage ?? ''}>
              <option value="">All stages</option>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </Select>
            <Button type="submit" variant="ghost">Filter</Button>
          </form>

          {error ? <p className="muted">Deals could not be loaded. Refresh the page to try again.</p> : rows.length === 0 ? (
            <EmptyState title={stage ? `No deals at ${STAGE_LABEL[stage].toLowerCase()}` : 'No deals yet'}>
              {stage ? 'Try another stage, or clear the filter.' : 'Add the first one with the form.'}
            </EmptyState>
          ) : (
            <Table label="Deals">
              <thead>
                <tr>
                  <th>Creator</th><th>Brand</th><th>Stage</th>
                  <th className={tableCell.num}>Amount</th><th className={tableCell.num}>Commission</th><th>Last change</th>
                  <th className={tableCell.actions}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const creator = d.creators?.full_name ?? 'Unknown creator';
                  const brand = d.brands?.name ?? 'Unknown brand';
                  return (
                    <tr key={d.id}>
                      <td>{creator}</td>
                      <td>{brand}</td>
                      <td><StageForm id={d.id} stage={d.stage} label={`Stage for the ${brand} deal with ${creator}`} /></td>
                      <td className={tableCell.num}>{formatUsd(d.amount_cents)}</td>
                      <td className={tableCell.num}>{formatUsd(d.commission_cents)}</td>
                      <td>{formatWhen(d.stage_changed_at)}</td>
                      <td className={tableCell.actions}>
                        {staff.role === 'owner' ? (
                          <form action={deleteDealAction} className="inline-form">
                            <input type="hidden" name="id" value={d.id} />
                            <ConfirmButton title={`Delete the ${brand} deal?`} message="The deal is removed for everyone. Its commission goes with it. The audit log keeps a record." confirmLabel="Delete">Delete</ConfirmButton>
                          </form>
                        ) : null}
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

        <aside>
          <AddDealForm
            creators={(creators ?? []) as { id: string; full_name: string }[]}
            brands={(brands ?? []).map((b) => String(b.name))}
          />
        </aside>
      </div>
    </>
  );
}
