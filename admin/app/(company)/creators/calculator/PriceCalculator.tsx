'use client';
// The sponsorship price calculator form and results. All maths is in lib/pricing; nothing is sent or saved.
import { useMemo, useState } from 'react';
import { Input, Select } from '@/components/ui';
import {
  CPM_GROUPS, EXTRAS, FORMATS, defaultPriceInput, formatCount, formatMoney, parseCount, parseDecimal, priceSponsorship,
  type CpmGroupId, type Currency, type ExtraId, type FormatId, type PriceContext, type PriceResult,
} from '@/lib/pricing';
import s from './calculator.module.css';

export type Prefill = {
  name: string;
  niche: CpmGroupId;
  subs: number | null;
  views: number | null;
  eng: number | null;
  aud: string;
};

type Props = {
  prefill: Prefill | null;
  fromName: string | null;
  sponsor: PriceContext['sponsor'];
  pastDeals: NonNullable<PriceContext['pastDeals']>;
};

const fmt = (n: number | null) => (n ? formatCount(n) : '');

export function PriceCalculator({ prefill, fromName, sponsor, pastDeals }: Props) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [niche, setNiche] = useState<CpmGroupId>(prefill?.niche ?? 'life');
  const [own, setOwn] = useState(false);
  const [cpmLo, setCpmLo] = useState('');
  const [cpmHi, setCpmHi] = useState('');
  const [subs, setSubs] = useState(fmt(prefill?.subs ?? null));
  const [views, setViews] = useState(fmt(prefill?.views ?? null));
  const [eng, setEng] = useState(prefill?.eng != null ? String(prefill.eng) : '');
  const [aud, setAud] = useState(prefill?.aud ?? '');
  const [format, setFormat] = useState<FormatId>('int');
  const [usage, setUsage] = useState('');
  const [excl, setExcl] = useState('');
  const [wide, setWide] = useState(false);
  const [extras, setExtras] = useState<Record<ExtraId, boolean>>({ link: true, pin: false, post: false });
  const [margin, setMargin] = useState('20');
  const [cur, setCur] = useState<Currency>('USD');
  const [rateText, setRateText] = useState('1.5');
  const [rate, setRate] = useState(1.5);

  const input = useMemo(
    () =>
      defaultPriceInput({
        name: name.trim(), niche, own, cpmLo: parseDecimal(cpmLo), cpmHi: parseDecimal(cpmHi), subs: parseCount(subs), views: parseCount(views),
        eng: parseDecimal(eng), aud, format, usage: Math.max(0, parseDecimal(usage) || 0), excl: Math.max(0, parseDecimal(excl) || 0), wide, extras,
        margin: parseDecimal(margin),
      }),
    [name, niche, own, cpmLo, cpmHi, subs, views, eng, aud, format, usage, excl, wide, extras, margin],
  );
  const result = useMemo(() => priceSponsorship(input, { currency: cur, rate, sponsor, pastDeals }), [input, cur, rate, sponsor, pastDeals]);
  const money = (v: number, dec = false) => formatMoney(v, cur, rate, dec);

  return (
    <section className={`panel ${s.calc}`} aria-label="Sponsorship price calculator">
      <div>
        <h2>Sponsorship price calculator</h2>
        <p className={s.lead}>
          {fromName
            ? `Filled in from ${fromName}'s profile${sponsor ? `, for a deal with ${sponsor.name}` : ''}. Change anything.`
            : 'Works out a fair price for a paid sponsorship, and shows every step.'}
        </p>
        <fieldset className={s.group}>
          <legend>Channel data</legend>
          <Input label="Channel name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="Niche (sets the default CPM)" value={niche} onChange={(e) => setNiche(e.target.value as CpmGroupId)}>
            {CPM_GROUPS.map((g) => <option key={g.id} value={g.id}>{`${g.name}: $${g.lo} to $${g.hi}${g.open ?? ''}`}</option>)}
          </Select>
          <label className={s.check}><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> I have a better CPM figure</label>
          {own ? (
            <div className={s.inline}>
              <label className={s.dm} htmlFor="c-cpmlo">CPM from $</label>
              <input id="c-cpmlo" inputMode="decimal" value={cpmLo} onChange={(e) => setCpmLo(e.target.value)} autoFocus />
              <label className={s.dm} htmlFor="c-cpmhi">to $</label>
              <input id="c-cpmhi" inputMode="decimal" value={cpmHi} onChange={(e) => setCpmHi(e.target.value)} />
            </div>
          ) : null}
          <div className={s.two}>
            <Input label="Subscribers" inputMode="numeric" value={subs} onChange={(e) => setSubs(e.target.value)} onBlur={() => { const n = parseCount(subs); if (n != null) setSubs(formatCount(n)); }} />
            <Input label="Average views per video" inputMode="numeric" hint="Last 10 long-form videos, without viral outliers." value={views} onChange={(e) => setViews(e.target.value)} onBlur={() => { const n = parseCount(views); if (n != null) setViews(formatCount(n)); }} />
          </div>
          <Input label="Engagement rate, %" inputMode="decimal" placeholder="Not known" hint="Likes plus comments, as a share of views. Leave empty if you do not know it." value={eng} onChange={(e) => setEng(e.target.value)} />
          <Input label="Main audience countries" placeholder="Not known" hint="Write it like this: US 40%, UK 15%, AU 10%. Leave empty if you do not know it." value={aud} onChange={(e) => setAud(e.target.value)} />
        </fieldset>
        <fieldset className={s.group}>
          <legend>Deal details</legend>
          <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as FormatId)}>
            {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
          <div className={s.two}>
            <Input label="Usage rights, months" inputMode="numeric" placeholder="None" hint="The brand may reuse it in paid ads. Empty means none." value={usage} onChange={(e) => setUsage(e.target.value)} />
            <Input label="Exclusivity, days" inputMode="numeric" placeholder="None" hint="No competing brands. Empty means none." value={excl} onChange={(e) => setExcl(e.target.value)} />
          </div>
          <label className={s.check}><input type="checkbox" checked={wide} onChange={(e) => setWide(e.target.checked)} /> The exclusivity covers a wide category</label>
          <span className={s.subhead}>Extras</span>
          {EXTRAS.map((e) => (
            <label key={e.id} className={s.check}>
              <input type="checkbox" checked={extras[e.id]} onChange={(ev) => setExtras({ ...extras, [e.id]: ev.target.checked })} /> {e.name}
            </label>
          ))}
          <div className={s.two} style={{ marginTop: 12 }}>
            <Input label="Smallfold's margin, %" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
            <div className={s.field}>
              <span className="label" id="c-cur">Show prices in</span>
              <div className={s.seg} role="radiogroup" aria-labelledby="c-cur">
                {(['USD', 'AUD'] as const).map((x) => (
                  <label key={x}><input type="radio" name="c-cur" value={x} checked={cur === x} onChange={() => setCur(x)} /><span>{x}</span></label>
                ))}
              </div>
            </div>
          </div>
          {cur === 'AUD' ? (
            <div className={s.inline}>
              <label className={s.dm} htmlFor="c-rate">1 USD =</label>
              <input id="c-rate" inputMode="decimal" value={rateText} onChange={(e) => { setRateText(e.target.value); const r = parseDecimal(e.target.value); if (r != null && r > 0) setRate(r); }} />
              <span className={`${s.dm} ${s.small}`}>AUD. Type today&apos;s rate. 1.50 is only a starting value. CPMs stay in USD.</span>
            </div>
          ) : null}
        </fieldset>
        <div className={s.bar} aria-hidden="true"><span>Recommended asking price</span><b>{result ? money(result.ask) : '–'}</b></div>
      </div>
      <div className={s.out} aria-live="polite">{result ? <Results r={result} name={input.name} views={input.views!} money={money} /> : <Empty />}</div>
    </section>
  );
}

function Empty() {
  return (
    <>
      <div className="label">Recommended asking price</div>
      <div className={s.big}>–</div>
      <p className={s.dm}>Enter the average views per video to get a price. Without views there is nothing to multiply.</p>
    </>
  );
}

type M = (v: number, dec?: boolean) => string;

function Row({ label, sub, v, money, dec, total }: { label: string; sub?: string; v: number[]; money: M; dec?: boolean; total?: boolean }) {
  return (
    <tr className={total ? 'total' : undefined} style={total ? { fontWeight: 600 } : undefined}>
      <td>{label}{sub ? <span className={s.sub}>{sub}</span> : null}</td>
      {v.map((x, i) => <td key={i} className={s.r}>{money(x, dec)}</td>)}
    </tr>
  );
}

function Head({ first }: { first: string }) {
  return <thead><tr><th>{first}</th><th className={s.r}>Low</th><th className={s.r}>Mid</th><th className={s.r}>High</th></tr></thead>;
}

function Results({ r, name, views, money }: { r: PriceResult; name?: string; views: number; money: M }) {
  return (
    <>
      <div className="label">Recommended asking price{name ? ` for ${name}` : ''}</div>
      <div className={s.big}>{money(r.ask)}</div>
      <p>{r.reason}</p>
      <h3>The split</h3>
      <div className={s.wrap}><table className={s.table}><Head first="" /><tbody>
        <Row label="Price to brand" v={r.price} money={money} />
        <Row label="Creator payout" sub={`Price × ${100 - r.margin}%`} v={r.payout} money={money} />
        <Row label="Smallfold's cut" sub={`Price × ${r.margin}%`} v={r.cut} money={money} />
        <Row label="Effective CPM the brand pays" sub="Price ÷ views × 1,000" v={r.eff} money={money} dec total />
      </tbody></table></div>
      <h3>Working, step by step</h3>
      <div className={s.wrap}><table className={s.table}><Head first="Step" /><tbody>
        <Row label="1. Base fee" sub={`${formatCount(views)} views × CPM ÷ 1,000, with a CPM of $${r.cpm[0]}, $${r.cpm[1]} and $${r.cpm[2]}`} v={r.base} money={money} />
        {r.steps.map((st, i) => <Row key={st.label} label={(i === 0 ? '2. ' : '') + st.label} sub={st.detail} v={st.v} money={money} />)}
        <Row label="Price to brand" sub="After every adjustment" v={r.price} money={money} total />
      </tbody></table></div>
      <h3>3. Checks</h3>
      <ul className={s.list}>
        {r.checks.map((c, i) => <li key={i}><span className={`${s.flag} ${c.ok ? s.flagOk : ''}`}>{c.tag ?? (c.ok ? 'Fine' : 'Look')}</span>{c.text}</li>)}
      </ul>
      {r.flags.length ? (<><h3>Missing or unreliable inputs</h3><ul className={s.list}>{r.flags.map((t) => <li key={t}><span className={s.flag}>Flag</span>{t}</li>)}</ul></>) : null}
      <h3>Assumptions made</h3>
      <ul className={s.list}>{r.assumptions.map((t) => <li key={t}>{t}</li>)}</ul>
      {r.better.length ? (<><h3>What would make this more accurate</h3><ul className={s.list}>{r.better.map((t) => <li key={t}>{t}</li>)}</ul></>) : null}
      <p className={s.note}>This is a starting point for a negotiation, not a quote. A price is never put in a first email, and nothing here is sent to anyone.</p>
    </>
  );
}
