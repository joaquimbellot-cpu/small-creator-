const TIER1 = ['us', 'usa', 'united states', 'uk', 'gb', 'united kingdom', 'ca', 'canada', 'au', 'aus', 'australia'];

/** "US 40%, UK 15%" -> total share listed and the share in the US, UK, Canada and Australia. Null when no share is found. */
export function parseAudience(text: string | null | undefined): { total: number; t1: number } | null {
  const re = /([A-Za-z][A-Za-z .]*?)\s*:?\s*(\d+(?:\.\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  let total = 0;
  let t1 = 0;
  let n = 0;
  while ((m = re.exec(text || ''))) {
    const v = parseFloat(m[2]);
    total += v;
    n++;
    if (TIER1.includes(m[1].trim().toLowerCase())) t1 += v;
  }
  return n ? { total: Math.round(total), t1: Math.round(t1) } : null;
}
