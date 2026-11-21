// Turns a creators row into the few facts Claude may see.
import type { CreatorFacts } from './types';

export function toFacts(c: {
  full_name: string;
  channel_name: string | null;
  channel_url: string | null;
  niche: string | null;
  subscribers: number | null;
  subscribers_hidden: boolean;
}): CreatorFacts {
  return {
    fullName: c.full_name,
    firstName: c.full_name.trim().split(/\s+/)[0],
    channelName: c.channel_name,
    channelUrl: c.channel_url,
    niche: c.niche,
    subscribers: c.subscribers_hidden ? null : c.subscribers,
  };
}
