// Small text helpers for the profile. Dates are fixed en-GB and UTC (the page is rendered on the server).
const ONE_DAY = 86_400_000;

/** "today", "3 days ago", "2 weeks ago", "5 months ago", "2 years ago". */
export function ago(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const days = Math.floor((now - new Date(iso).getTime()) / ONE_DAY);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
