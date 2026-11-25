// Mock pitch drafting: no network call. Used when ANTHROPIC_API_KEY is missing or DRAFT_MODE=mock.
// It writes only from the facts, so its output passes the same validator as Claude's.
import type { Draft } from './types';
import { short } from './pitch-facts';
import type { PitchFacts } from './pitch-types';

const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

// Every sentence starts with a capital whether or not the optional facts are there: a sentence never starts with the sponsor's
// or the channel's name (those can be lower case, such as "eBay"), and "your channel" is capitalised where it opens a sentence.
export function mockPitch(f: PitchFacts): Draft {
  const name = f.creator.channelName;
  const channel = name || 'your channel';
  const niche = f.creator.niche ? f.creator.niche.toLowerCase() : null;
  const { targetMinSubs: lo, targetMaxSubs: hi } = f.sponsor;
  const size = lo !== null && hi !== null ? `${short(lo)} to ${short(hi)}` : null;
  const inRange = f.creator.subscribers !== null && lo !== null && hi !== null && f.creator.subscribers >= lo && f.creator.subscribers <= hi;
  const past = f.pastSponsors.map((p) => p.name);
  const hist = past.length === 0 ? null : past.length === 1 ? past[0] : past.length === 2 ? `${past[0]} and ${past[1]}` : `${past[0]}, ${past[1]} and ${past[2]}`;
  const many = f.similarChannels === 1 ? 'channel' : 'channels';
  const subs = f.creator.subscribers !== null ? f.creator.subscribers.toLocaleString('en-US') : null;
  const views = f.creator.avgViews !== null ? f.creator.avgViews.toLocaleString('en-US') : null;
  const hello = (n: string | null) => (n ? `Hi ${n},` : 'Hello,');

  if (f.direction === 'to_creator') {
    const parts = [
      hello(f.creator.firstName || null),
      'We connect small YouTube channels with sponsors, and a person at Smallfold chooses each match by hand.',
      `We think ${f.sponsor.name} may suit ${channel}.${size ? ` They look for ${niche ? `${niche} ` : ''}channels with ${size} subscribers.` : ''}${subs ? ` Your channel has ${subs} subscribers${inRange ? ', so it is the size they ask for' : ''}.` : ''}`,
      hist ? `You have already worked with ${hist}, so you know how a sponsored video works.` : null,
      f.similarChannels > 0 && niche ? `So far, ${f.sponsor.name} has sponsored ${f.similarChannels} other ${niche} ${many}.` : null,
      'Would you like to hear more? A short reply is enough. You have the final say on every sponsor we suggest.',
    ];
    return { subject: `A sponsor that fits ${channel}: ${f.sponsor.name}`, body: parts.filter(Boolean).join('\n\n') };
  }
  const kind = niche ? `${an(niche)} ${niche} channel` : 'a YouTube channel';
  const intro = `${name ? `This is ${name}, ${kind}` : `This is ${kind}`}${subs ? ` with ${subs} subscribers` : ''}${views ? `${subs ? ' and' : ' with'} about ${views} views per video` : ''}${inRange ? `, inside the size ${f.sponsor.name} usually works with` : ''}.`;
  const parts = [
    hello(f.contactFirstName),
    'We connect brands with small YouTube channels, and a person at Smallfold chooses each match by hand.',
    f.creator.channelUrl ? `${intro} Here is the channel: ${f.creator.channelUrl}` : intro,
    hist ? `The channel has completed sponsorships with ${hist}.` : null,
    f.similarChannels > 0 && niche ? `So far, you have sponsored ${f.similarChannels} other ${niche} ${many}, so the audience should feel familiar.` : null,
    'If this sounds useful, reply and we will send more detail and set up an introduction.',
  ];
  const lead = niche ? `${an(niche) === 'an' ? 'An' : 'A'} ${niche}` : 'A YouTube';
  return { subject: `${lead} channel for ${f.sponsor.name}${name ? `: ${name}` : ''}`, body: parts.filter(Boolean).join('\n\n') };
}
