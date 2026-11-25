// Re-test fixes for SR-04: the re-tester's own 10 drafts (5 clean, 5 bad), 5 extras, more clean and bad drafts, and the way in.
// A rule-based checker cannot know that an invented lower-case brand or a subtle false claim is invented: see build/retest-fixes.md.
import { describe, expect, it } from 'vitest';
import { COMMON_WORDS } from './common-words';
import { buildPitchFacts } from './pitch-facts';
import { mockPitch } from './pitch-mock';
import { hasDomain, hasEmail, hasSpelledAddress, unsafeReason } from './pitch-safety';
import { pitchProblem } from './pitch-validate';
import type { PitchInput } from './pitch-types';

const input: PitchInput = {
  direction: 'to_sponsor',
  creator: { full_name: 'Sam Hale', channel_name: 'Sam Plays', channel_url: 'https://www.youtube.com/@samplays', niche: null, niche_slug: 'gaming', subscribers: 8500, subscribers_hidden: false, avg_views: 2100 },
  sponsor: { id: 's1', name: 'Northwind Gear Co', industry: 'Outdoor gear', target_niches: ['gaming'], target_min_subs: 5000, target_max_subs: 30000 },
  nicheNames: { gaming: 'Gaming' },
  confirmed: [{ brand_id: 'b1', brand_name: 'Lumen Audio', sponsored_on: '2026-03-10' }, { brand_id: 'b2', brand_name: 'Quill & Co Stationery', sponsored_on: '2026-01-05' }],
  detected: [],
  similarChannels: 2,
  contactName: 'Pat Lee',
};
const { facts } = buildPitchFacts(input);
const KNOWN = ['Orbit Desk', 'Gridiron Snacks', 'Tidewater Coffee'];
const check = (subject: string, body: string) => pitchProblem({ subject, body }, facts, { knownNames: KNOWN });
const hdr = 'Hi Pat,\n\n';

// The re-tester's 10 drafts, as described in 08-retest.md section 3 (script /tmp/rt/validate10.cjs).
const RETEST_CLEAN: [string, string, string][] = [
  ['C1 plain intro', 'Intro to Sam Plays', hdr + 'We connect small YouTube channels with brands, and a person at Smallfold chooses each match by hand. Sam Plays is a gaming channel with 8,500 subscribers and about 2,100 views per video. Northwind Gear Co looks for creators of this size.\n\nIf this sounds useful, reply and we will send more detail.'],
  ['C2 with the channel link', 'A gaming channel for Northwind Gear Co', hdr + 'Here is the channel: https://www.youtube.com/@samplays. It has 8,500 subscribers. Our team thinks it suits Northwind Gear Co.\n\nWould you like to hear more?'],
  ['C3 past sponsors and months', 'Sam Plays and Northwind Gear Co', hdr + 'The channel completed sponsorships with Lumen Audio in Mar 2026 and Quill & Co Stationery in Jan 2026. Smallfold has matched two other gaming channels with Northwind Gear Co. Since the audience is of a similar size, we thought of you.\n\nA short reply is enough.'],
  ['C4 hyphens and a question', 'A fit for Northwind Gear Co?', hdr + 'We work only with small channels - 1,000 to 50,000 subscribers - and Sam Plays is one of them. Is this something your team would like to look at? Smallfold replies within 2 working days.'],
  ['C5 short, subject "Introduction"', 'Introduction', hdr + 'We would like to introduce Sam Plays, a gaming channel that may suit Northwind Gear Co. Our team picked it by hand. Would you like to hear more?'],
];
const RETEST_BAD: [string, string, string][] = [
  ['B1 bare domain with an ending not on the old list', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has 8,500 subscribers. You can see more at samplays.club and the full reel is there too.\n\nWould you like to hear more?'],
  ['B2 email spelled out', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has 8,500 subscribers. If you prefer, write to sam at samplays dot com and we will arrange it.\n\nWould you like to hear more?'],
  ['B3 invented brands, lower case', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has 8,500 subscribers and recently worked with zentora and brightfox on two videos.\n\nWould you like to hear more?'],
  ['B4 number written in words', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has forty thousand subscribers and a very engaged audience of gamers.\n\nWould you like to hear more?'],
  ['B5 a promise of results', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has 8,500 subscribers. We guarantee that a sponsored video will lift your sales, and Smallfold will reply within 2 working days.\n\nWould you like to hear more?'],
  ['X1 a stranger name at sentence start', 'Sam Plays for Northwind Gear Co', hdr + 'Orbit Desk also worked with this channel. Sam Plays has 8,500 subscribers.\n\nWould you like to hear more?'],
  ['X2 invented capitalised brand mid-sentence', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has 8,500 subscribers and has made videos for Brightfox Labs.\n\nWould you like to hear more?'],
  ['X3 payment word in disguise', 'Sam Plays for Northwind Gear Co', hdr + 'Sam Plays has 8,500 subscribers and a generous compensation package is usual for a thousand bucks.\n\nWould you like to hear more?'],
  ['X4 a domain in the subject', 'See samplays.link now', hdr + 'Sam Plays has 8,500 subscribers.\n\nWould you like to hear more?'],
  ['X5 another link on the channel host', 'Sam Plays', hdr + 'Sam Plays has 8,500 subscribers: https://www.youtube.com/@attackerchannel\n\nWould you like to hear more?'],
];

describe('the re-tester’s own drafts', () => {
  it.each(RETEST_CLEAN)('accepts %s', (_n, subject, body) => expect(check(subject, body)).toBeNull());
  it.each(RETEST_BAD)('refuses %s', (_n, subject, body) => expect(check(subject, body)).not.toBeNull());
});

// More clean drafts: varied openings of the subject and of the sentences. Every one must pass.
const OK_BODY = hdr + 'Sam Plays is a gaming channel with 8,500 subscribers. Northwind Gear Co may suit it.\n\nWould you like to hear more?';
const CLEAN_SUBJECTS = [
  'Introduction', 'Quick question about Sam Plays', 'Following up on a gaming channel', 'Hello from Smallfold', 'Meet Sam Plays',
  'Proposal: Sam Plays for Northwind Gear Co', 'Would Sam Plays suit Northwind Gear Co?', 'Hello Pat', 'Partnership idea', 'Thoughts on a gaming channel',
  'Request for a short introduction', 'Looking for gaming channels?', 'Perhaps a fit', 'Warm introduction to Sam Plays', 'Quick Question About Sam Plays',
  'A Gaming Channel For Northwind Gear Co', 'Following Your Outdoor Gear Range', 'Noticed a fit between two small teams', 'Something small and calm',
];
const CLEAN_BODIES: [string, string][] = [
  ['Introducing', hdr + 'Introducing Sam Plays, a gaming channel with 8,500 subscribers. Northwind Gear Co may suit it.'],
  ['Following', hdr + 'Following our chat with the channel, we think Northwind Gear Co may suit Sam Plays.'],
  ['Looking', hdr + 'Looking at your outdoor gear range, we think Sam Plays may be a fit. It has 8,500 subscribers.'],
  ['Given', hdr + 'Given your target size of 5k to 30k, Sam Plays fits. Would you like to hear more?'],
  ['Based', hdr + 'Based on your range, Sam Plays may suit Northwind Gear Co. A short reply is enough.'],
  ['Please', hdr + 'Please let us know if Sam Plays is of interest. Our team chose it by hand.'],
  ['Many', hdr + 'Many small channels are looking for a first sponsor. Sam Plays is one of them, with 8,500 subscribers.'],
  ['Perhaps', hdr + 'Perhaps Sam Plays could suit Northwind Gear Co. Smallfold replies within 2 working days.'],
  ['Thanks', hdr + 'Thanks for reading. Sam Plays is a gaming channel with about 2,100 views per video.'],
  ['Together', hdr + 'Together with our team, we picked Sam Plays for Northwind Gear Co. Would you like to hear more?'],
  ['Recently and Currently', hdr + 'Recently, Sam Plays reached 8,500 subscribers. Currently, it is open to a first partner like Northwind Gear Co.'],
  ['Hopefully', hdr + 'Hopefully this is useful. Sam Plays has 8,500 subscribers and Northwind Gear Co may suit it.'],
  ['Our', hdr + 'Our team picks each match by hand. Sam Plays is a gaming channel that may suit Northwind Gear Co.'],
  ['Every', hdr + 'Every match is made by a person. Sam Plays and Northwind Gear Co look like a good one.'],
  ['abbreviations', hdr + 'We work with small channels, e.g. Sam Plays, i.e. channels with 1,000 to 50,000 subscribers.'],
  ['colon list', hdr + 'Here is why: the channel has 8,500 subscribers, the size you look for. Northwind Gear Co may suit it.'],
  ['quote', hdr + 'We like how the channel feels. "Calm and clear" is how we would put it, and Northwind Gear Co may agree.'],
  ['two sentences, one name', hdr + 'Lumen Audio sponsored the channel in Mar 2026. Sam Plays has 8,500 subscribers.'],
  ['such as past sponsors', hdr + 'The channel has worked with sponsors such as Lumen Audio and Quill & Co Stationery.'],
  ['worked with creators', hdr + 'Smallfold has worked with small creators for a while. Sam Plays is a gaming channel that may suit Northwind Gear Co.'],
  ['percent word absent, numbers fine', hdr + 'The audience is of a similar size to the channels you sponsor. Sam Plays has 8,500 subscribers and about 2,100 views per video.'],
  ['dot in a normal word', hdr + 'Sam Plays has a polka dot logo on its set. Northwind Gear Co may like the look.'],
  ['numbers in words that are ours', hdr + 'We have matched two other gaming channels with you. Sam Plays is one more that may fit.'],
  ['the sign-off', hdr + 'Sam Plays may suit Northwind Gear Co. Would you like to hear more?\n\nWarmly,\nThe Smallfold team'],
  ['Hello and Dear', 'Dear Pat,\n\nSam Plays may suit Northwind Gear Co. Hello again from the Smallfold team.'],
];
describe('more clean drafts all pass', () => {
  it.each(CLEAN_SUBJECTS)('subject: %s', (subject) => expect(check(subject, OK_BODY)).toBeNull());
  it.each(CLEAN_BODIES)('opening: %s', (_n, body) => expect(check('Sam Plays and Northwind Gear Co', body)).toBeNull());
  it('has at least 25 more clean drafts', () => expect(CLEAN_SUBJECTS.length + CLEAN_BODIES.length).toBeGreaterThanOrEqual(25));
  it('practice drafts, to the creator and to the contact, still pass', () => {
    for (const direction of ['to_creator', 'to_sponsor'] as const) {
      const f = buildPitchFacts({ ...input, direction }).facts;
      expect(pitchProblem(mockPitch(f), f, { knownNames: KNOWN })).toBeNull();
    }
  });
});

// More bad drafts: the new catches. Every one must be refused.
const BAD_BODIES: [string, string, RegExp][] = [
  ['domain .club', hdr + 'See the reel at samplays.club today.', /web address/],
  ['domain .link', hdr + 'See more at samplays.link and tell us.', /web address/],
  ['domain .test', hdr + 'Our page is shop.attacker.test for now.', /web address/],
  ['domain .museum', hdr + 'Details are on samplays.museum.', /web address/],
  ['domain .agency with a path', hdr + 'Details are on samplays.agency/reel for you.', /web address/],
  ['domain in capitals', hdr + 'Details are on SAMPLAYS.CLUB for you.', /web address/],
  ['hxxp link', hdr + 'Details: hxxp://samplays-club for you.', /web address/],
  ['space before the dot', hdr + 'Details are on samplays . club for you.', /web address/],
  ['bracket dot', hdr + 'Details are on samplays[.]club for you.', /placeholder|web address/],
  ['full-width dot', hdr + 'Details are on samplays．club for you.', /web address/],
  ['zero-width inside the domain', hdr + 'Details are on samplays​.club for you.', /web address/],
  ['dot spelled out', hdr + 'Details are on samplays dot club for you.', /email address|web address/],
  ['upper-case DOT', hdr + 'Details are on samplays DOT com for you.', /email address|web address/],
  ['email spelled out with at and dot', hdr + 'Write to sam at samplays dot com please.', /email address/],
  ['email with (at) and (dot)', hdr + 'Write to sam (at) samplays (dot) com please.', /email address/],
  ['email with [at]', hdr + 'Write to sam [at] samplays [dot] com please.', /placeholder|email address/],
  ['email with full-width at sign', hdr + 'Write to sam＠samplays.com please.', /email address/],
  ['a mail service named', hdr + 'You can find us on gmail under the channel name.', /email address/],
  ['amount in words: five hundred dollars', hdr + 'A typical fee is five hundred dollars.', /price|money|amount/i],
  ['amount in words: a thousand pounds', hdr + 'Many sponsors offer a thousand pounds.', /price|money|amount/i],
  ['amount as 2k per video', hdr + 'Sponsors often offer 2k per video.', /price|money|amount/i],
  ['a hundred bucks', hdr + 'Sponsors often add a hundred bucks.', /price|money|amount/i],
  ['percentage of earnings', hdr + 'You keep 90% of what the video brings in.', /percent|share|money/i],
  ['percent in words', hdr + 'You keep ninety percent of the video.', /percent|share|money/i],
  ['compensation', hdr + 'A generous compensation package is usual.', /money|price/i],
  ['number in words: ten thousand', hdr + 'Sam Plays gets ten thousand views on a good video.', /number/i],
  ['number in words: one hundred fifty', hdr + 'Sam Plays has one hundred fifty videos.', /number/i],
  ['vague big number', hdr + 'Thousands of viewers watch Sam Plays.', /number/i],
  ['promise: guarantee', hdr + 'We guarantee a strong match.', /promise/],
  ['promise: guaranteed', hdr + 'A reply is guaranteed within a day.', /promise/],
  ['promise: spaced out', hdr + 'We g u a r a n t e e a strong match.', /promise/],
  ['promise: you will earn', hdr + 'You will earn a lot from this video.', /promise|earn/],
  ['promise: you’ll earn', hdr + 'You’ll earn more than before.', /promise|earn/],
  ['promise: double your', hdr + 'A sponsor can double your reach.', /promise/],
  ['promise: risk-free', hdr + 'This is a risk-free way to start.', /promise/],
  ['promise: boost your sales', hdr + 'Sam Plays will boost your sales.', /promise/],
  ['promise: sure thing', hdr + 'This is a sure thing for both sides.', /promise/],
  ['promise: 100 percent', hdr + 'Sam Plays is 100% a fit.', /promise|percent/],
  ['promise: we promise', hdr + 'We promise a quick answer.', /promise/],
  ['lower-case brands after worked with', hdr + 'Sam Plays worked with zentora and brightfox last year.', /zentora/],
  ['lower-case brand after partnered with', hdr + 'Sam Plays partnered with nimbusco on a video.', /nimbusco/],
  ['lower-case brand after brands like', hdr + 'Sam Plays is liked by brands like zentora.', /zentora/],
  ['invented one-word brand opening the body', hdr + 'Zentora would love Sam Plays.', /Zentora/],
  ['invented brand opening the subject', hdr + 'Sam Plays may suit you.', /Zentora/],
];
describe('more bad drafts all fail', () => {
  it.each(BAD_BODIES)('refuses: %s', (name, body, re) => {
    const r = name === 'invented brand opening the subject' ? check('Zentora and Sam Plays', body) : check('Sam Plays and Northwind Gear Co', body);
    expect(r, name).toMatch(re);
  });
  it('has at least 25 more bad drafts', () => expect(BAD_BODIES.length).toBeGreaterThanOrEqual(25));
  it('refuses a domain, a spelled-out address or a promise in the subject', () => {
    for (const s of ['See samplays.club now', 'Write sam at samplays dot com', 'We guarantee a match', 'Five hundred dollars for Sam Plays']) expect(check(s, OK_BODY), s).not.toBeNull();
  });
});

describe('the same patterns on the way in', () => {
  const past = (name: string) => buildPitchFacts({ ...input, confirmed: [{ brand_id: 'b9', brand_name: name, sponsored_on: '2026-03-14' }] }).facts.pastSponsors;
  it('drops a past sponsor, a channel name or an industry with a domain-like token, whatever its ending', () => {
    for (const v of ['Evil shop.attacker.test', 'Evil shop.attacker.club', 'attacker.link', 'attacker.xyz', 'x.museum', 'evil shop dot com', 'evil (dot) com', 'sam at evil dot com']) {
      expect(past(v), v).toEqual([]);
      expect(buildPitchFacts({ ...input, creator: { ...input.creator, channel_name: v } }).facts.creator.channelName, v).toBeNull();
      expect(buildPitchFacts({ ...input, sponsor: { ...input.sponsor, industry: v } }).facts.sponsor.industry, v).toBeNull();
    }
  });
  it('keeps ordinary names', () => {
    for (const v of ['Acme', 'Quill & Co Stationery', 'Dr. Squatch Soap', 'Polka Dot Kids', 'Acme v2.0', '3.5 Stars Cafe', 'e.g. Acme']) expect(unsafeReason(v), v).toBeNull();
  });
  it('the helpers', () => {
    expect(hasDomain('see a.b or e.g. this or i.e. that or 4.2k or v2.0')).toBe(false);
    expect(hasDomain('example.travel')).toBe(true);
    expect(hasEmail('sam＠example')).toBe(true);
    expect(hasSpelledAddress('a polka dot pattern')).toBe(false);
  });
});

describe('the word list', () => {
  it('has at least 1,000 words, all lower case', () => {
    expect(COMMON_WORDS.size).toBeGreaterThanOrEqual(1000);
    for (const w of COMMON_WORDS) expect(w).toBe(w.toLowerCase());
  });
  it('does not contain an invented brand', () => {
    for (const w of ['zentora', 'globex', 'brightfox', 'nimbusco']) expect(COMMON_WORDS.has(w)).toBe(false);
  });
});
