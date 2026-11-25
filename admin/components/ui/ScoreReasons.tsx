// A match score always comes with its reasons. ScoreReasons renders the band, a thin meter and the reasons;
// it renders NOTHING when `reasons` is empty, so a bare number can never appear.
//   <ScoreReasons total={82} reasons={[{ points: 40, text: 'Same niche: Tech' }, { points: 20, text: 'Sponsored 2 similar creators', unconfirmed: false }]} />
// ScoreBand is only the label ("Strong match · 82"), for a table cell that opens the reasons in a <details>.
import type { ReactNode } from 'react';
import k from './kit.module.css';
import { SourceBadge } from './Badges';

export type ScoreReason = {
  /** Points this reason adds (shown as +40). */
  points: number;
  text: ReactNode;
  /** The reason rests on a detected, unverified record: it gets the "Detected" badge. */
  unconfirmed?: boolean;
};

export type ScoreBandName = 'Strong' | 'Possible' | 'Weak';

/** 70 and above is Strong, 40 and above is Possible, below that is Weak (as in the approved prototype). */
export function scoreBand(total: number): ScoreBandName {
  return total >= 70 ? 'Strong' : total >= 40 ? 'Possible' : 'Weak';
}

export function ScoreBand({ total, band }: { total: number; band?: ScoreBandName }) {
  const b = band ?? scoreBand(total);
  const tone = b === 'Strong' ? k.bandStrong : b === 'Possible' ? k.bandPossible : k.bandWeak;
  return <span className={`${k.band} ${tone}`}>{b} match · {total}</span>;
}

export function ScoreReasons({ total, reasons, band, hideBand }: { total: number; reasons: ScoreReason[]; band?: ScoreBandName; hideBand?: boolean }) {
  if (!reasons || reasons.length === 0) return null;
  const pct = Math.max(0, Math.min(100, total));
  return (
    <div>
      {hideBand ? null : <ScoreBand total={total} band={band} />}
      <div className={k.meter} role="img" aria-label={`Score ${total} out of 100`}><i style={{ width: `${pct}%` }} /></div>
      <ul className={k.reasons}>
        {reasons.map((r, i) => (
          <li key={i}>
            <span className={k.points}>+{r.points}</span>
            <span>{r.text} {r.unconfirmed ? <SourceBadge source="detected" short /> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
