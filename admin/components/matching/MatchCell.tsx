// The Match column of the two lists: the band and score on one line, the reasons behind a small "Why" disclosure.
// A pair that can never be linked shows the reason instead of a score. Works in server and client components.
import { ScoreBand, ScoreReasons } from '@/components/ui';
import type { Reason } from '@/lib/matching';
import m from './matching.module.css';

export type ListMatch = { total: number; reasons: Reason[]; blocked: string | null; openStage?: string | null };

export function MatchCell({ match }: { match: ListMatch }) {
  if (match.blocked) return <span className="muted">{match.blocked.replace(' This pair cannot be linked.', '')}</span>;
  return (
    <details className={m.why}>
      <summary><ScoreBand total={match.total} /> <span className="muted">Why</span></summary>
      <div className={m.whyBody}><ScoreReasons total={match.total} reasons={match.reasons} hideBand /></div>
    </details>
  );
}
