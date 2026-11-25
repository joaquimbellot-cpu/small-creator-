// The sponsorship timeline of one creator (side "creator") or of one sponsor (side "brand"), newest first, with the
// Confirmed / Detected labels and the add, edit, confirm, reject and restore actions. Renders its own section.
// Server component: loads the records (user's client, row security applies) and hands them to the client part.
import { Notice } from '@/components/ui';
import { loadHistory } from '@/lib/sponsorships/load';
import type { SponsorshipSide } from '@/lib/sponsorships/types';
import { HistoryClient } from './HistoryClient';

export async function SponsorshipHistory({ side, id }: { side: SponsorshipSide; id: string }) {
  let records;
  try {
    records = await loadHistory(side, id);
  } catch {
    return (
      <section className="panel-sec" aria-label="Sponsorship history">
        <Notice tone="error">The sponsorship records could not be loaded. Refresh the page to try again.</Notice>
      </section>
    );
  }
  return <HistoryClient key={`${side}-${id}`} side={side} ownerId={id} records={records} />;
}
