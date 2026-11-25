// The sponsorship price calculation. Pure: no React, no database. Same inputs, same price.
import { parseAudience } from './audience';
import { commissionUsd } from './commission';
import { CPM_GROUPS, EXTRAS, FORMATS } from './constants';
import { formatMoney, plural, shortCount, tidy } from './format';
import type { PriceCheck, PriceContext, PriceInput, PriceResult, PriceStep, Triple } from './types';

export const pct = (p: number) => (p === 0 ? 'no change' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`);

export function usagePercent(months: number): number {
  return months > 0 ? Math.round(Math.min(50, 20 + ((months - 1) * 30) / 11)) : 0;
}

export function exclusivityPercent(days: number, wide: boolean): number {
  return days > 0 ? Math.round(Math.min(30, Math.max(10, 10 + ((days - 30) * 20) / 150) + (wide ? 5 : 0))) : 0;
}

export function priceSponsorship(P: PriceInput, ctx: PriceContext = {}): PriceResult | null {
  if (!P.views || P.views <= 0) return null;
  const cur = ctx.currency ?? 'USD';
  const rate = ctx.rate && ctx.rate > 0 ? ctx.rate : 1;
  const money = (v: number, dec = false) => formatMoney(v, cur, rate, dec);

  const flags: string[] = [];
  const assume: string[] = [];
  const better: string[] = [];
  const checks: PriceCheck[] = [];
  const g = CPM_GROUPS.find((x) => x.id === P.niche) ?? CPM_GROUPS[1];
  let cl = g.lo;
  let ch = g.hi;
  if (P.own && P.cpmLo != null && P.cpmHi != null && P.cpmLo > 0 && P.cpmHi >= P.cpmLo) {
    cl = P.cpmLo;
    ch = P.cpmHi;
  } else {
    if (P.own) flags.push('Your own CPM is not complete: the low figure must be above 0 and not above the high figure. The default range was used instead.');
    assume.push(
      `Used the default CPM range for ${g.name}: $${g.lo} to $${g.hi}${g.open ?? ''}.${g.open ? ' The top of this range is open-ended, so the high figure may be too low.' : ''}`,
    );
    better.push('A CPM this channel has really been paid before.');
  }
  const cpm: Triple = [cl, (cl + ch) / 2, ch];
  const base = cpm.map((c) => (P.views! * c) / 1000) as Triple;
  const steps: PriceStep[] = [];
  let run: Triple = [...base];
  const push = (label: string, detail: string, mult: Triple) => {
    run = run.map((v, i) => v * mult[i]) as Triple;
    steps.push({ label, detail, v: [...run] });
  };
  const m3 = (p: number): Triple => [1 + p / 100, 1 + p / 100, 1 + p / 100];

  const f = FORMATS.find((x) => x.id === P.format) ?? FORMATS[0];
  push(
    `Format: ${f.name}`,
    f.low === f.high ? 'The base fee is the price of one integration, so it stays as it is (×1).' : `×${f.low} for low, ×${f.mid} for mid, ×${f.high} for high.`,
    [f.low, f.mid, f.high],
  );

  const a = parseAudience(P.aud);
  let gp = 0;
  let gd: string;
  if (!a) {
    gd = 'Not given, so nothing was changed.';
    flags.push('The audience countries are missing. No geography adjustment was applied.');
    better.push("The audience by country, from the creator's own YouTube analytics.");
  } else if (a.total > 100) {
    gd = `The shares add up to ${a.total}%, which cannot be right. Nothing was changed.`;
    flags.push(`The audience shares add up to ${a.total}%. Check the figures. No geography adjustment was applied.`);
  } else if (a.total < 50) {
    gd = `Only ${a.total}% of the audience is listed. Nothing was changed.`;
    flags.push(`The countries listed cover only ${a.total}% of the audience, which is too little to judge. No geography adjustment was applied.`);
    better.push('More of the audience by country (at least half of it).');
  } else {
    gp = a.t1 >= 70 ? 20 : a.t1 >= 50 ? 10 : a.t1 >= 30 ? 0 : a.t1 >= 15 ? -15 : -30;
    gd = `${a.t1}% of the audience is in the US, UK, Canada or Australia.`;
  }
  push(`Audience geography: ${pct(gp)}`, gd, m3(gp));

  let ep = 0;
  let ed: string;
  if (P.eng == null) {
    ed = 'Not given, so nothing was changed.';
    flags.push('The engagement rate is missing. No engagement adjustment was applied.');
    better.push('The engagement rate: likes plus comments, as a share of views, over the last 10 videos.');
  } else {
    ep = P.eng >= 10 ? 20 : P.eng >= 7 ? 10 : P.eng >= 2 ? 0 : P.eng >= 1 ? -10 : -20;
    ed = `${P.eng}% is ${P.eng >= 7 ? 'well above 5%' : P.eng >= 2 ? 'inside the normal band (2% to 7%)' : 'below 2%'}.`;
    if (P.eng > 15) flags.push(`An engagement rate of ${P.eng}% is unusually high. Check that it is likes plus comments divided by views.`);
  }
  push(`Engagement: ${pct(ep)}`, ed, m3(ep));

  const core: Triple = [...run];
  const up = usagePercent(P.usage);
  push(`Usage rights: ${pct(up)}`, P.usage > 0 ? `The brand may reuse the video in paid ads for ${plural(P.usage, 'month')}.` : 'None.', m3(up));
  const xp = exclusivityPercent(P.excl, P.wide);
  push(
    `Exclusivity: ${pct(xp)}`,
    P.excl > 0 ? `No competing brands for ${plural(P.excl, 'day')}, ${P.wide ? 'across a wide category' : 'in a narrow category'}.` : 'None.',
    m3(xp),
  );
  const price: Triple = [...run];

  let mg = P.margin;
  if (mg == null || mg < 0 || mg > 100) {
    flags.push("Smallfold's margin is missing or not between 0 and 100. 20% was used.");
    mg = 20;
  } else if (mg > 50) flags.push(`A margin of ${mg}% leaves the creator less than half of the price.`);
  const payout = price.map((v) => v * (1 - mg! / 100)) as Triple;
  const cut = price.map((v) => (v * mg!) / 100) as Triple;
  const eff = price.map((v) => (v / P.views!) * 1000) as Triple;

  // Step 3: checks
  if (P.subs && P.subs > 0) {
    const ratio = P.views / P.subs;
    const band = [(P.subs / 1000) * 10 * f.low, (P.subs / 1000) * 25 * f.high];
    if (ratio > 1.5) flags.push(`Average views are ${ratio.toFixed(1)} times the subscriber count. Check that viral outliers were left out.`);
    if (ratio < 0.03) flags.push('Average views are under 3% of subscribers. The audience may be inactive, so a price based on subscribers would be too high.');
    const far = core[1] < band[0] / 2 ? 'well below' : core[1] > band[1] * 2 ? 'well above' : null;
    const side = core[1] < band[0] ? 'a little below that range, but not far off' : core[1] > band[1] ? 'a little above that range, but not far off' : 'inside that range';
    checks.push({
      ok: !far,
      text: `Typical flat rate for ${shortCount(P.subs)} subscribers (${f.name.toLowerCase()}): about ${money(band[0])} to ${money(band[1])}, a rule of thumb of $10 to $25 per 1,000 subscribers. The mid figure before rights add-ons is ${money(core[1])}, which is ${far ? far + ' that range. Look again at the average views and the CPM' : side}.`,
    });
    const near = (ctx.pastDeals ?? [])
      .filter((d) => d.amountUsd > 0 && d.subscribers >= P.subs! / 2 && d.subscribers <= P.subs! * 2)
      .map((d) => d.amountUsd)
      .sort((x, y) => x - y);
    if (near.length >= 3) {
      checks.push({
        ok: true,
        text: `Smallfold's own deals with channels of this size: ${money(near[0])} to ${money(near[near.length - 1])}, middle value ${money(near[Math.floor(near.length / 2)])} (${near.length} deals).`,
      });
    } else better.push("More of Smallfold's own closed deals with channels of this size, to compare against.");
  } else {
    flags.push('The subscriber count is missing, so the check against typical flat rates was skipped.');
  }
  if (eff[1] > ch * 1.5) {
    checks.push({
      ok: false,
      text: `The brand would pay an effective CPM of ${money(eff[1], true)}, above the top of the usual range for this niche ($${ch}). The add-ons explain it, but expect the brand to push back.`,
    });
  }
  const sp = ctx.sponsor;
  if (sp) {
    checks.push({
      ok: price[1] >= sp.budgetMinUsd && price[1] <= sp.budgetMaxUsd,
      text: `${sp.name} usually pays ${money(sp.budgetMinUsd)} to ${money(sp.budgetMaxUsd)} per creator. The mid price of ${money(price[1])} is ${price[1] < sp.budgetMinUsd ? 'below' : price[1] > sp.budgetMaxUsd ? 'above' : 'inside'} that.`,
    });
  }
  const cm = commissionUsd(price[1]);
  checks.push({
    ok: false,
    tag: 'Decide',
    text: `The back office today takes 10%, 8% or 5% depending on the deal size. On ${money(price[1])} that is ${Math.round((cm / price[1]) * 100)}% (${money(cm)}), not the ${mg}% used here (${money(cut[1])}). One rule has to be chosen before this is built for real.`,
  });

  const xs = EXTRAS.filter((e) => P.extras[e.id]).map((e) => e.name.toLowerCase());
  if (xs.length) assume.push(`Extras (${xs.join(', ')}) are included in the price. The method gives no figure for them.`);
  assume.push(
    'The method says only "raise" or "lower" for geography and engagement. The sizes used here are working values: geography +20% at 70% or more in the four countries, +10% from 50%, −15% under 30%, −30% under 15%; engagement +10% from 7%, +20% from 10%, −10% under 2%, −20% under 1%.',
  );
  assume.push('Usage rights rise evenly from +20% for 1 month to +50% for 12 months or more. Exclusivity rises from +10% for 30 days to +30% for 180 days, with 5 points more for a wide category.');
  assume.push('The adjustments are multiplied one after another, in the order shown.');
  if (P.format !== 'int') better.push(`Past prices for a ${f.name.toLowerCase()} on this channel. The format multiplier is a wide range.`);

  const ask = tidy(price[1]);
  const why = [`mid CPM of $${cpm[1]} for ${g.name.toLowerCase()}`, f.name.toLowerCase()];
  if (gp) why.push(`${pct(gp)} for audience geography`);
  if (ep) why.push(`${pct(ep)} for engagement`);
  if (up) why.push(`${pct(up)} for usage rights`);
  if (xp) why.push(`${pct(xp)} for exclusivity`);
  const missing = (a && a.total >= 50 && a.total <= 100 ? 0 : 1) + (P.eng == null ? 1 : 0);
  const reason = `The mid figure, rounded: ${why.join(', ')}. Go no lower than ${money(tidy(price[0]))}.${missing ? ` ${missing === 2 ? 'Two inputs are' : 'One input is'} missing, so treat it as a rough figure.` : ''}`;

  return { cpm, base, steps, price, payout, cut, eff, margin: mg, ask, reason, checks, flags, assumptions: assume, better };
}
