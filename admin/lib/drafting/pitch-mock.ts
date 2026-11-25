// Mock pitch drafting: no network call. Used when ANTHROPIC_API_KEY is missing or DRAFT_MODE=mock.
// It writes only from the facts, so its output passes the same validator as Claude's.
import type { Draft } from './types';
import { short } from './pitch-facts';
import type { PitchFacts } from './pitch-types';

export function mockPitch(f: PitchFacts): Draft {
  const channel = f.creator.channelName || 'your channel';
  const niche = f.creator.niche ? f.creator.niche.toLowerCase() : null;
  const { targetMinSubs: lo, targetMaxSubs: hi } = f.sponsor;
  const size = lo !== null && hi !== null ? `${short(lo)} to ${short(hi)}` : null;
  const inRange = f.creator.subscribers !== null && lo !== null && hi !== null && f.creator.subscribers >= lo && f.creator.subscribers <= hi;
  const past = f.pastSponsors.map((p) => p.name);
  const hist = past.length === 0 ? null : past.length === 1 ? past[0] : past.length === 2 ? `${past[0]} and ${past[1]}` : `${past[0]}, ${past[1]} and ${past[2]}`;
  const similar = f.similarChannels > 0 && niche ? `${f.sponsor.name} has sponsored ${f.similarChannels} other ${niche} ${f.similarChannels === 1 ? 'channel' : 'channels'} before.` : null;

  if (f.direction === 'to_creator') {
    const parts = [
      `Hi ${f.creator.firstName},`,
      "We connect small YouTube channels with sponsors, and a person at Smallfold chooses each match by hand.",
      `${f.sponsor.name} may suit ${channel}.${size ? ` They look for ${niche ? `${niche} ` : ''}channels with ${size} subscribers.` : ''}${f.creator.subscribers !== null ? ` ${channel} has ${f.creator.subscribers.toLocaleString('en-US')} subscribers${inRange ? ', so it is the size they ask for' : ''}.` : ''}`,
      hist ? `You have already worked with ${hist}, so you know how a sponsored video works.` : null,
      similar,
      'Would you like to hear more? A short reply is enough. You have the final say on every sponsor we suggest.',
    ];
    return { subject: `A sponsor that fits ${channel}: ${f.sponsor.name}`, body: parts.filter(Boolean).join('\n\n') };
  }
  const name = f.contactFirstName;
  const parts = [
    name ? `Hi ${name},` : 'Hello,',
    'We connect brands with small YouTube channels, and a person at Smallfold chooses each match by hand.',
    `${channel} is ${niche ? `a ${niche} channel` : 'a channel'}${f.creator.subscribers !== null ? ` with ${f.creator.subscribers.toLocaleString('en-US')} subscribers` : ''}${f.creator.avgViews !== null ? ` and about ${f.creator.avgViews.toLocaleString('en-US')} views per video` : ''}${inRange ? `, inside the size ${f.sponsor.name} usually works with` : ''}.${f.creator.channelUrl ? ` ${f.creator.channelUrl}` : ''}`,
    hist ? `The channel has completed sponsorships with ${hist}.` : null,
    similar ? similar.replace(`${f.sponsor.name} has sponsored`, 'You have sponsored').replace(' before.', ' before, so the audience should feel familiar.') : null,
    'If this sounds useful, reply and we will send more detail and set up an introduction.',
  ];
  return { subject: `A ${niche ?? 'YouTube'} channel for ${f.sponsor.name}: ${channel}`, body: parts.filter(Boolean).join('\n\n') };
}
