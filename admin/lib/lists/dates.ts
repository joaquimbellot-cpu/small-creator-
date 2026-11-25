// One date style for the back office: "20 Sep 2026", "20 Sep 2026, 14:05" (UTC). Newer ICU data spells September
// "Sept" in en-GB; every other month has three letters, so this puts the three-letter form back everywhere.
export function dateFormatter(opts: Intl.DateTimeFormatOptions): { format: (d: Date | number) => string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
  return { format: (d) => f.format(d).replace(/\bSept\b/g, 'Sep') };
}
