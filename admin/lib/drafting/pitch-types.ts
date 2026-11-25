// Pitch mode: an email about one sponsor and one creator. These are the ONLY facts Claude may see in this mode.
// There is no field for an email address, phone number, note, price, budget or commission, so none can slip in.
export type PitchDirection = 'to_creator' | 'to_sponsor';

export type PitchFacts = {
  direction: PitchDirection;
  creator: {
    firstName: string;
    channelName: string | null;
    channelUrl: string | null;
    niche: string | null;
    subscribers: number | null; // null = hidden or unknown
    avgViews: number | null;
  };
  sponsor: {
    name: string;
    industry: string | null;
    targetNiches: string[]; // niche names
    targetMinSubs: number | null;
    targetMaxSubs: number | null;
  };
  /** Confirmed sponsorships of this creator, never the sponsor being pitched. At most 3. */
  pastSponsors: { name: string; month: string }[];
  /** Other channels in the creator's niche that the sponsor has confirmed sponsorships with. */
  similarChannels: number;
  /** Only for the sponsor direction: the contact person's first name. */
  contactFirstName: string | null;
};

/** What the screen shows under the draft. Sentences only. */
export type PitchLists = { used: string[]; leftOut: string[] };

export type PitchInput = {
  direction: PitchDirection;
  /** A creators row. Extra columns (email, phone, notes) may be present and are ignored. */
  creator: {
    full_name: string;
    channel_name: string | null;
    channel_url: string | null;
    niche: string | null;
    niche_slug?: string | null;
    subscribers: number | null;
    subscribers_hidden: boolean;
    avg_views?: number | null;
  };
  /** A brands row. Extra columns (budgets, notes, website) are ignored. */
  sponsor: {
    id: string;
    name: string;
    industry: string | null;
    target_niches: string[] | null; // slugs
    target_min_subs: number | null;
    target_max_subs: number | null;
  };
  /** niche slug -> name */
  nicheNames: Record<string, string>;
  /** Rows of the view creator_sponsorship_facts for this creator (confirmed, not rejected). The only source of past sponsors. */
  confirmed: { brand_id: string | null; brand_name: string | null; sponsored_on: string | null }[];
  /** Detected records of this creator. Shown to the person as "Left out"; never sent to Claude. */
  detected: { brand_name: string | null; sponsored_on: string | null; rejected?: boolean }[];
  similarChannels: number;
  /** The contact person's full name (sponsor direction). Only the first word is kept. */
  contactName: string | null;
};
