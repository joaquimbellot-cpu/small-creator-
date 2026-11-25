'use client';
// The rows of the Creators list, as a table or as cards. Presentation only: the page and CreatorsList own the data,
// the selection and the address. The name is a real link (keyboard, "open in a new tab"); a plain click on the row or
// the name opens the side panel without a full page change.
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Badge, Card, CardGrid, KeyValue, Table, cardLinkClass, cardRaiseClass, cardTitleClass, tableCell } from '@/components/ui';
import { STATUS_LABEL, STATUS_TONE, type ListRow } from '@/lib/creators/constants';
import { MatchCell } from '@/components/matching/MatchCell';
import { formatFull } from '@/lib/lists/numbers';
import { fmtDay, languageName, nicheName, regionName, sponsorshipText } from './list-format';
import s from './creators.module.css';

export type RowsProps = {
  rows: ListRow[];
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  hrefFor: (id: string) => string;
  onOpen: (id: string) => void;
  detected: boolean;
};

const subs = (r: ListRow) => (r.subscribers_hidden ? 'Hidden' : r.subscribers == null ? '—' : formatFull(r.subscribers));
const places = (r: ListRow) => [r.country ? regionName(r.country) : null, r.language ? languageName(r.language) : null].filter(Boolean).join(' · ');
const channelLine = (r: ListRow) => (r.channel_name ?? 'No channel name') + (r.has_email ? '' : ' · no email');

function plainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function CreatorsRows({ rows, selected, onToggle, onToggleAll, hrefFor, onOpen, detected }: RowsProps) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const showMatch = rows.some((r) => r.match); // only with sort=match&for=<sponsor>
  const nameLink = (r: ListRow) => (
    <Link href={hrefFor(r.id)} prefetch={false} scroll={false} className={s.rowLink} onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onOpen(r.id); } }}>{r.full_name}</Link>
  );
  return (
    <Table clickable label="Creators">
      <thead>
        <tr>
          <th className={s.checkCell}><input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={(e) => onToggleAll(e.target.checked)} /></th>
          <th className={s.nameCol}>Name</th>
          <th className={s.midCol}>Niche</th>
          <th className={tableCell.num}>Subscribers</th>
          <th className={tableCell.num}>Average views</th>
          <th className={s.midCol}>Sponsorships</th>
          <th>Status</th>
          <th>Last contacted</th>
          {showMatch ? <th>Match</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const sp = sponsorshipText(r, detected);
          return (
            <tr key={r.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a,input,button,label')) onOpen(r.id); }}>
              <td className={s.checkCell}><input type="checkbox" aria-label={`Select ${r.full_name}`} checked={selected.has(r.id)} onChange={(e) => onToggle(r.id, e.target.checked)} /></td>
              <td className={s.nameCol}>{nameLink(r)}<span className={s.subLine}>{channelLine(r)}</span></td>
              <td className={s.midCol}>{nicheName(r.niche_slug) ?? <span className={s.none}>Not set</span>}<span className={s.subLine}>{places(r) || 'No country or language'}</span></td>
              <td className={`${tableCell.num} ${s.nowrap}`}>{subs(r)}</td>
              <td className={tableCell.num}>{r.avg_views == null ? '—' : formatFull(r.avg_views)}</td>
              <td className={s.midCol}>
                {sp.none ? <span className={s.none}>{sp.main}</span> : <>{r.sponsorship_count} confirmed{r.detected_sponsorship_count ? <span className={s.none}> + {r.detected_sponsorship_count} detected</span> : null}</>}
                {sp.last ? <span className={s.subLine}>{sp.last}</span> : null}
              </td>
              <td className={s.nowrap}><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
              <td className={s.nowrap}>{fmtDay(r.last_contacted_at) ?? <span className={s.none}>Never</span>}</td>
              {showMatch ? <td>{r.match ? <MatchCell match={r.match} /> : null}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function CreatorsCards({ rows, selected, onToggle, hrefFor, onOpen, detected }: RowsProps) {
  return (
    <CardGrid label="Creators">
      {rows.map((r) => {
        const sp = sponsorshipText(r, detected);
        return (
          <Card key={r.id}>
            <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
              <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              <span className={cardRaiseClass}>
                <input type="checkbox" aria-label={`Select ${r.full_name}`} checked={selected.has(r.id)} onChange={(e) => onToggle(r.id, e.target.checked)} />
              </span>
            </div>
            <h3 className={cardTitleClass}>
              <Link href={hrefFor(r.id)} prefetch={false} scroll={false} className={cardLinkClass} onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onOpen(r.id); } }}>{r.full_name}</Link>
            </h3>
            <p className={s.cardMeta}>{channelLine(r)} · {nicheName(r.niche_slug) ?? 'No niche'}{places(r) ? ` · ${places(r)}` : ''}</p>
            <KeyValue label="Subscribers">{subs(r)}</KeyValue>
            <KeyValue label="Average views">{r.avg_views == null ? '—' : formatFull(r.avg_views)}</KeyValue>
            <KeyValue label="Sponsorships">{sp.none ? sp.main : `${sp.main}${sp.last ? ` · ${sp.last.replace('Last: ', '')}` : ''}`}</KeyValue>
            <KeyValue label="Last contacted">{fmtDay(r.last_contacted_at) ?? 'Never'}</KeyValue>
            {r.match ? <div><MatchCell match={r.match} /></div> : null}
          </Card>
        );
      })}
    </CardGrid>
  );
}
