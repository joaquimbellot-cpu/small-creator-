'use client';
// The deals board: one column per stage with its count and total; cards with "Move to" (a native select, so it works with
// a keyboard and on tablets) and drag and drop on top of it. Moving is a server action; the board updates at once and goes back
// if the server says no. Each column shows 50 cards and a "Show more" button, so a few hundred deals stay quick.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, useToast } from '@/components/ui';
import { STAGES, STAGE_LABEL, formatUsd, timeInStage, type Stage } from '@/lib/deals/format';
import { AmountEditor } from './AmountEditor';
import { DeleteDealForm } from './DeleteDealForm';
import { moveDealAction } from './actions';
import s from './deals.module.css';

export type BoardDeal = {
  id: string; stage: Stage; amount_cents: number | null; stage_changed_at: string;
  creator_id: string; creator: string; brand_id: string; brand: string;
};
const STEP = 50;

export function DealsBoard({ deals: initial, now, drafts, isOwner = false }: { deals: BoardDeal[]; now: string; drafts: Record<string, ReactNode>; isOwner?: boolean }) {
  const toast = useToast();
  const [deals, setDeals] = useState(initial);
  const [shown, setShown] = useState<Record<string, number>>({});
  const [over, setOver] = useState<Stage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const dragId = useRef<string | null>(null);
  const clock = useMemo(() => new Date(now), [now]);

  // The server sends a fresh list after every change (revalidation); follow it.
  useEffect(() => setDeals(initial), [initial]);

  const byStage = useMemo(() => {
    const m = new Map<Stage, BoardDeal[]>(STAGES.map((st) => [st, []]));
    for (const d of deals) m.get(d.stage)?.push(d);
    for (const list of m.values()) list.sort((a, b) => b.stage_changed_at.localeCompare(a.stage_changed_at));
    return m;
  }, [deals]);

  const move = useCallback(async (id: string, stage: Stage) => {
    const was = deals.find((d) => d.id === id);
    if (!was || was.stage === stage) return;
    setBusy((b) => new Set(b).add(id));
    setDeals((all) => all.map((d) => (d.id === id ? { ...d, stage, stage_changed_at: new Date().toISOString() } : d)));
    const r = await moveDealAction({ id, stage }).catch(() => ({ ok: false as const, error: 'Could not reach the server. Try again.' }));
    setBusy((b) => { const n = new Set(b); n.delete(id); return n; });
    if (!r.ok) {
      setDeals((all) => all.map((d) => (d.id === id ? was : d)));
      toast(r.error);
    } else toast(r.message);
  }, [deals, toast]);

  const setAmount = (id: string, cents: number | null) => setDeals((all) => all.map((d) => (d.id === id ? { ...d, amount_cents: cents } : d)));

  return (
    <div className={s.boardWrap}>
      <div className={s.board} tabIndex={0} role="region" aria-label="Deals board">
        {STAGES.map((st) => {
          const list = byStage.get(st) ?? [];
          const total = list.reduce((sum, d) => sum + (d.amount_cents ?? 0), 0);
          const limit = shown[st] ?? STEP;
          return (
            <section
              key={st} className={`${s.col} ${over === st ? s.over : ''}`} data-stage={st} aria-label={STAGE_LABEL[st]}
              onDragOver={(e) => { if (dragId.current) { e.preventDefault(); setOver(st); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === st ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); const id = dragId.current ?? e.dataTransfer.getData('text/plain'); dragId.current = null; setOver(null); setDragging(null); if (id) void move(id, st); }}
            >
              <div className={s.colHead}>
                <h2 className={s.colTitle}>{STAGE_LABEL[st]} <span className={s.count} aria-label={`${list.length} deals`}>{list.length}</span></h2>
                <div className={s.total}>{total ? formatUsd(total) : 'No amounts yet'}</div>
              </div>
              <div className={s.colBody}>
                {list.slice(0, limit).map((d) => {
                  const who = `${d.creator} with ${d.brand}`;
                  return (
                    <article
                      key={d.id} className={`${s.card} ${dragging === d.id ? s.dragging : ''} ${busy.has(d.id) ? s.busy : ''}`} data-deal={d.id} draggable
                      onDragStart={(e) => { dragId.current = d.id; setDragging(d.id); e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { dragId.current = null; setDragging(null); setOver(null); }}
                    >
                      <div className={s.who}>
                        <strong><Link href={`/creators/${d.creator_id}`} prefetch={false}>{d.creator}</Link></strong><br />
                        <span className="muted">with</span> <Link href={`/sponsors/${d.brand_id}`} prefetch={false}>{d.brand}</Link>
                      </div>
                      <div className={s.kv}>
                        <span className={s.num}><AmountEditor id={d.id} cents={d.amount_cents} who={who} onSaved={(c) => setAmount(d.id, c)} /></span>
                        <span className="muted" title={`In this stage since ${new Date(d.stage_changed_at).toUTCString()}`}>{timeInStage(d.stage_changed_at, clock)}</span>
                      </div>
                      <label className="sr-only" htmlFor={`mv-${d.id}`}>Move the deal {who} to</label>
                      <select id={`mv-${d.id}`} className={s.move} value={d.stage} disabled={busy.has(d.id)} onChange={(e) => void move(d.id, e.target.value as Stage)}>
                        {STAGES.map((o) => <option key={o} value={o}>{o === d.stage ? 'Stage: ' : 'Move to: '}{STAGE_LABEL[o]}</option>)}
                      </select>
                      {d.stage === 'matched' || d.stage === 'contacted' || isOwner ? (
                        <div className={s.cardActions}>
                          {d.stage === 'matched' || d.stage === 'contacted' ? (drafts[d.id] ?? null) : null}
                          {isOwner ? <DeleteDealForm id={d.id} brand={d.brand} /> : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {list.length === 0 ? <p className={s.empty}>Nothing here.</p> : null}
                {list.length > limit ? (
                  <div className={s.more}>
                    <Button variant="ghost" size="sm" onClick={() => setShown((m) => ({ ...m, [st]: limit + STEP }))}>
                      Show {Math.min(STEP, list.length - limit)} more ({list.length - limit} not shown)
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      <p className={s.hint}>Drag a card, or use its “Move to” menu.{isOwner ? ' The owner can delete a deal from its card.' : ''} Moving a deal to Completed or Paid adds a Confirmed sponsorship to both histories. “Matched” is a pair that is linked but not contacted yet.</p>
    </div>
  );
}
