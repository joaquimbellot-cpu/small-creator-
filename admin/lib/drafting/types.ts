// What the drafting code is allowed to know about a creator. Notes, email and phone are
// deliberately NOT here, so they cannot end up in a prompt by accident.
export type CreatorFacts = {
  fullName: string;
  firstName: string;
  channelName: string | null;
  channelUrl: string | null;
  niche: string | null;
  subscribers: number | null; // null = hidden or unknown
};

/** The person's instruction: a saved template, or one sentence describing the goal. */
export type Instruction = { kind: 'template'; subject: string; body: string } | { kind: 'goal'; goal: string };

export type Draft = { subject: string; body: string };
export type DraftResult = { ok: true; draft: Draft } | { ok: false; error: string };
