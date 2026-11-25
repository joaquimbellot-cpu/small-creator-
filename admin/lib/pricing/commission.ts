/** The back office's own commission rule (set by the database): 10% under $500, 8% under $2,000, 5% from $2,000. */
export function commissionUsd(amount: number): number {
  return Math.round(amount * (amount < 500 ? 0.1 : amount < 2000 ? 0.08 : 0.05));
}
