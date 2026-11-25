// The tools Claude can call. SERVER ONLY. Every tool runs as the logged-in owner (RLS applies).
//
// What Claude may see of a creator: id, name, channel name and link, niche, subscribers (or hidden), status,
// deal count, total earned, last contacted. The columns are listed by name below, so email, phone and notes
// cannot slip in. Database text is wrapped with untrusted() (angle brackets removed, tagged as data).
// What Claude may write: email drafts (status "draft", the owner approves and sends). Everything else is a
// proposal that waits for the owner's click. There is no tool that sends, deletes or exports.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import type { Staff } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { STATUSES } from '@/lib/creators/constants';
import { validateCreator, type CreatorField } from '@/lib/creators/schema';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/deals/format';
import { cleanDraft, draftProblem } from '@/lib/drafting/validate';
import { creatorsByIds } from '@/lib/email/creators';
import { cleanText, untrusted } from './untrusted';
import { createProposal, EDIT_FIELDS, type CreatePayload, type StagePayload, type UpdatePayload } from './proposals';
import type { AssistantEvent } from './types';

export type ToolContext = {
  supabase: SupabaseClient;
  staff: Staff;
  threadId: string;
  emit: (e: AssistantEvent) => void;
  draftsMade: number;
  /** Ids of creators and Inbox messages the tools returned during this owner message (for the audit log). */
  seen: { creators: Set<string>; inbox: Set<string> };
};
export type ToolResult = { text: string; isError?: boolean };

export const MAX_DRAFTS_PER_MESSAGE = 10;
export const MAX_SEEN_IDS = 50;

/** The ids to put in the audit line, capped. */
export const seenIds = (ctx: ToolContext) => ({
  creators: [...ctx.seen.creators].slice(0, MAX_SEEN_IDS),
  inbox: [...ctx.seen.inbox].slice(0, MAX_SEEN_IDS),
});
const MAX_RESULT_CHARS = 30_000;

const CREATOR_COLUMNS = 'id, full_name, channel_name, channel_url, niche, subscribers, subscribers_hidden, status, deal_count, total_earned_cents, last_contacted_at';
type CreatorRow = {
  id: string; full_name: string; channel_name: string | null; channel_url: string | null; niche: string | null;
  subscribers: number | null; subscribers_hidden: boolean; status: string; deal_count: number; total_earned_cents: number; last_contacted_at: string | null;
};
const creatorForClaude = (c: CreatorRow) => ({
  id: c.id,
  full_name: untrusted(c.full_name, 200),
  channel_name: untrusted(c.channel_name, 200),
  channel_url: untrusted(c.channel_url, 500),
  niche: untrusted(c.niche, 200),
  subscribers: c.subscribers_hidden ? 'hidden' : c.subscribers,
  status: c.status,
  deal_count: c.deal_count,
  total_earned_cents: c.total_earned_cents,
  last_contacted_at: c.last_contacted_at,
});

// ---------------------------------------------------------------- tool definitions
// strict: true and additionalProperties: false on every tool. Inputs are checked again with zod below.
const obj = (properties: Record<string, unknown>, required: string[] = []): BetaTool.InputSchema => ({
  type: 'object', properties, required, additionalProperties: false,
});
const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });
const tool = (name: string, description: string, input_schema: BetaTool.InputSchema): BetaTool => ({ name, description, input_schema, strict: true });

export const TOOLS: BetaTool[] = [
  tool('get_overview_stats', 'The numbers shown on the Overview page: total creators, emails sent, replies, reply rate, deals by stage, active deals, commission earned (cents).', obj({})),
  tool('search_creators', 'Search creators by name, channel name or niche. With no query, lists the newest. Returns at most 25.', obj({
    query: str('Text to look for in the name, channel name or niche.'),
    status: { type: 'string', enum: [...STATUSES], description: 'Only creators with this status.' },
    limit: int('How many to return, 1 to 25. Default 10.'),
  })),
  tool('get_creator', 'One creator by id.', obj({ creator_id: str('The creator id (a UUID from search_creators).') }, ['creator_id'])),
  tool('list_deals', 'Deals with creator name, brand, stage and amount in cents (null when the amount is not set yet). Newest first.', obj({
    creator_id: str('Only deals of this creator.'),
    stage: { type: 'string', enum: [...STAGES], description: 'Only deals in this stage.' },
    limit: int('How many to return, 1 to 50. Default 20.'),
  })),
  tool('list_emails', 'The email log: subject, status, dates and creator name. Not the body, not the address.', obj({
    creator_id: str('Only emails to this creator.'),
    status: { type: 'string', enum: ['draft', 'approved', 'sending', 'sent', 'failed', 'replied'], description: 'Only emails with this status.' },
    limit: int('How many to return, 1 to 50. Default 20.'),
  })),
  tool('list_templates', 'The saved email templates (name, goal, subject, body).', obj({})),
  tool('list_inbox', 'The Inbox: brand inquiries sent through the website form (id, name, topic, a short summary of company, product and budget, date, handled date). Never the sender address or phone.', obj({
    unhandled_only: { type: 'boolean', description: 'Only messages not yet handled.' },
    limit: int('How many to return, 1 to 30. Default 10.'),
  })),
  tool('create_email_draft', 'Save an email draft for one creator. It goes to the Review page with status draft; the owner approves and sends it. Refused for do-not-contact and suppressed creators. Plain text, subject on one line, no placeholders, no signature or footer.', obj({
    creator_id: str('The creator id.'),
    subject: str('Subject line, one line, at most 120 characters.'),
    body: str('Email body, plain text, under 200 words.'),
  }, ['creator_id', 'subject', 'body'])),
  tool('propose_add_creator', 'Propose adding a creator. Waits for the owner to approve. Use only an email address the owner typed in this chat.', obj({
    name: str('Full name.'),
    email: str('Email address, typed by the owner.'),
    channel_url: str('YouTube channel link.'),
    niche: str('Niche.'),
    subscribers: int('Subscriber count.'),
    status: { type: 'string', enum: [...STATUSES], description: 'Starting status. Default new.' },
  }, ['name', 'email'])),
  tool('propose_edit_creator', 'Propose changing a creator. Waits for the owner to approve. Give only the fields to change. A do_not_contact creator cannot be moved to another status. A field cannot be cleared this way.', obj({
    creator_id: str('The creator id.'),
    full_name: str('New full name.'),
    channel_url: str('New YouTube channel link.'),
    niche: str('New niche.'),
    subscribers: int('New subscriber count.'),
    status: { type: 'string', enum: [...STATUSES], description: 'New status.' },
  }, ['creator_id'])),
  tool('propose_deal_stage', 'Propose moving a deal to another stage. Waits for the owner to approve.', obj({
    deal_id: str('The deal id (a UUID from list_deals).'),
    stage: { type: 'string', enum: [...STAGES], description: 'The new stage.' },
  }, ['deal_id', 'stage'])),
];

// ---------------------------------------------------------------- helpers
const ok = (data: unknown): ToolResult => ({ text: JSON.stringify(data).slice(0, MAX_RESULT_CHARS) });
const fail = (message: string): ToolResult => ({ text: JSON.stringify({ error: message }), isError: true });
const limitOf = (n: number | undefined, def: number, max: number) => Math.min(Math.max(Math.floor(n ?? def) || def, 1), max);
const id = z.guid();

/** PostgREST .or() filter: text in double quotes, % _ \ escaped for ILIKE. Only name, channel name and niche (never the email). */
function likeFilter(q: string): string | null {
  const term = q.trim().slice(0, 100);
  if (!term) return null;
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
  const quoted = `"${`%${like}%`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return ['full_name', 'channel_name', 'niche'].map((c) => `${c}.ilike.${quoted}`).join(',');
}

type Handler = (input: unknown, ctx: ToolContext) => Promise<ToolResult>;

// ---------------------------------------------------------------- reads
const stats: Handler = async (_i, { supabase }) => {
  const { data, error } = await supabase.rpc('stats_overview');
  return error || !data ? fail('The Overview numbers could not be loaded.') : ok(data);
};

const searchCreators: Handler = async (input, { supabase, seen }) => {
  const p = z.object({ query: z.string().optional(), status: z.enum(STATUSES).optional(), limit: z.number().optional() }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  let q = supabase.from('creator_summaries').select(CREATOR_COLUMNS).order('created_at', { ascending: false }).limit(limitOf(p.data.limit, 10, 25));
  const f = likeFilter(p.data.query ?? '');
  if (f) q = q.or(f);
  if (p.data.status) q = q.eq('status', p.data.status);
  const { data, error } = await q;
  if (error) return fail('The search failed.');
  for (const c of data as CreatorRow[]) seen.creators.add(c.id);
  return ok({ count: data.length, creators: (data as CreatorRow[]).map(creatorForClaude) });
};

const getCreator: Handler = async (input, { supabase, seen }) => {
  const p = z.object({ creator_id: id }).safeParse(input);
  if (!p.success) return fail('creator_id must be a creator id from search_creators.');
  const { data } = await supabase.from('creator_summaries').select(CREATOR_COLUMNS).eq('id', p.data.creator_id).maybeSingle();
  if (data) seen.creators.add((data as CreatorRow).id);
  return data ? ok(creatorForClaude(data as CreatorRow)) : fail('No creator with that id.');
};

type DealRow = { id: string; stage: string; amount_cents: number | null; created_at: string; stage_changed_at: string; creators: { id: string; full_name: string } | null; brands: { name: string } | null };
const listDeals: Handler = async (input, { supabase, seen }) => {
  const p = z.object({ creator_id: id.optional(), stage: z.enum(STAGES).optional(), limit: z.number().optional() }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  let q = supabase.from('deals').select('id, stage, amount_cents, created_at, stage_changed_at, creators(id, full_name), brands(name)')
    .order('created_at', { ascending: false }).limit(limitOf(p.data.limit, 20, 50));
  if (p.data.creator_id) q = q.eq('creator_id', p.data.creator_id);
  if (p.data.stage) q = q.eq('stage', p.data.stage);
  const { data, error } = await q;
  if (error) return fail('Could not load deals.');
  for (const d of data as unknown as DealRow[]) if (d.creators?.id) seen.creators.add(d.creators.id);
  return ok({
    count: data.length,
    deals: (data as unknown as DealRow[]).map((d) => ({
      id: d.id, creator_id: d.creators?.id ?? null, creator: untrusted(d.creators?.full_name, 200), brand: untrusted(d.brands?.name, 200),
      stage: d.stage, amount_cents: d.amount_cents, created_at: d.created_at, stage_changed_at: d.stage_changed_at,
    })),
  });
};

type EmailRow = { id: string; subject: string; status: string; created_at: string; sent_at: string | null; replied_at: string | null; creators: { full_name: string } | null };
const listEmails: Handler = async (input, { supabase }) => {
  const p = z.object({ creator_id: id.optional(), status: z.enum(['draft', 'approved', 'sending', 'sent', 'failed', 'replied']).optional(), limit: z.number().optional() }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  let q = supabase.from('emails').select('id, subject, status, created_at, sent_at, replied_at, creators(full_name)')
    .order('created_at', { ascending: false }).limit(limitOf(p.data.limit, 20, 50));
  if (p.data.creator_id) q = q.eq('creator_id', p.data.creator_id);
  if (p.data.status) q = q.eq('status', p.data.status);
  const { data, error } = await q;
  if (error) return fail('Could not load the email log.');
  return ok({
    count: data.length,
    emails: (data as unknown as EmailRow[]).map((e) => ({
      id: e.id, creator: untrusted(e.creators?.full_name, 200), subject: untrusted(e.subject, 200), status: e.status,
      created_at: e.created_at, sent_at: e.sent_at, replied_at: e.replied_at,
    })),
  });
};

const listTemplates: Handler = async (_i, { supabase }) => {
  const { data, error } = await supabase.from('email_templates').select('id, name, goal, subject, body').order('name').limit(30);
  if (error) return fail('Could not load templates.');
  return ok({ templates: data.map((t) => ({ id: t.id, name: untrusted(t.name, 200), goal: untrusted(t.goal, 500), subject: untrusted(t.subject, 200), body: untrusted(t.body, 1500) })) });
};

const listInbox: Handler = async (input, { supabase, seen }) => {
  const p = z.object({ unhandled_only: z.boolean().optional(), limit: z.number().optional() }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  // The columns are named: the sender's email and phone are never selected (the message is a summary of company, product and budget).
  let q = supabase.from('contact_messages').select('id, name, topic, message, created_at, handled_at').order('created_at', { ascending: false }).limit(limitOf(p.data.limit, 10, 30));
  if (p.data.unhandled_only) q = q.is('handled_at', null);
  const { data, error } = await q;
  if (error) {
    const missing = error.code === 'PGRST205' || error.code === '42P01';
    return missing ? ok({ available: false, note: 'The Inbox is not available.' }) : fail('Could not load the Inbox.');
  }
  for (const m of data) seen.inbox.add(m.id);
  return ok({
    count: data.length,
    messages: data.map((m) => ({ id: m.id, name: untrusted(m.name, 200), topic: untrusted(m.topic, 200), message: untrusted(m.message, 1000), created_at: m.created_at, handled_at: m.handled_at })),
  });
};

// ---------------------------------------------------------------- email drafts
const createEmailDraft: Handler = async (input, ctx) => {
  const p = z.object({ creator_id: id, subject: z.string(), body: z.string() }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  if (ctx.draftsMade >= MAX_DRAFTS_PER_MESSAGE) return fail(`At most ${MAX_DRAFTS_PER_MESSAGE} drafts per message.`);
  // Same checks as Compose: blocked creators are skipped, the draft is cleaned and validated, then saved as a draft.
  const [creator] = await creatorsByIds(ctx.supabase, [p.data.creator_id]);
  if (!creator) return fail('No creator with that id.');
  if (creator.blocked) return fail(creator.blocked === 'do_not_contact' ? 'This creator is marked do not contact. No draft was saved.' : 'This creator is suppressed. No draft was saved.');
  const draft = cleanDraft({ subject: p.data.subject, body: p.data.body });
  const problem = draftProblem(draft, { allowedUrls: [creator.channel_url] });
  if (problem) return fail(problem);
  const { data, error } = await ctx.supabase
    .from('emails')
    .insert({ creator_id: creator.id, to_email: creator.email, subject: draft.subject, body: draft.body, template_id: null, source: 'claude' })
    .select('id')
    .single();
  if (error || !data) return fail('The draft could not be saved.');
  ctx.draftsMade += 1;
  await logAudit('email.drafted', 'email', data.id, { via: 'claude', by: ctx.staff.email });
  ctx.emit({ type: 'draft', emailId: data.id, creator: cleanText(creator.full_name, 200) });
  return ok({ saved: true, email_id: data.id, status: 'draft', creator: untrusted(creator.full_name, 200), note: 'The draft is on the Review page. The owner must approve and send it.' });
};

// ---------------------------------------------------------------- proposals
const proposed = async (ctx: ToolContext, kind: 'creator.create' | 'creator.update' | 'deal.stage', payload: object, summary: string): Promise<ToolResult> => {
  const proposal = await createProposal(ctx.supabase, ctx.threadId, kind, payload, summary);
  ctx.emit({ type: 'proposal', proposal });
  return ok({ proposal_id: proposal.id, status: 'pending', note: 'Waiting for the owner to approve or reject it. Nothing has changed yet.' });
};

const proposeAddCreator: Handler = async (input, ctx) => {
  const p = z.object({ name: z.string(), email: z.string(), channel_url: z.string().optional(), niche: z.string().optional(), subscribers: z.number().optional(), status: z.enum(STATUSES).optional() }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  const v = validateCreator({ name: p.data.name, email: p.data.email, channel_url: p.data.channel_url, niche: p.data.niche, subscribers: p.data.subscribers, status: p.data.status });
  if (!v.ok) return fail(Object.values(v.errors)[0] ?? 'Invalid creator.');
  // The address must be one the owner typed in this conversation, not one that came from Inbox or creator text.
  const { data: typed, error: typedErr } = await ctx.supabase.from('assistant_messages').select('content').eq('thread_id', ctx.threadId).eq('role', 'user').eq('content->0->>type', 'text').limit(300);
  if (typedErr) return fail('Could not check the address. Try again.');
  const want = v.data.email.toLowerCase();
  const wasTyped = (typed ?? []).some((m) => (m.content as { type?: string; text?: unknown }[]).some((b) => b.type === 'text' && typeof b.text === 'string' && b.text.toLowerCase().includes(want)));
  if (!wasTyped) return fail('Use an address the owner typed. Ask the owner for the email address.');
  const payload: CreatePayload = { name: v.data.full_name, email: v.data.email, channel_url: v.data.channel_url, niche: v.data.niche, subscribers: v.data.subscribers, status: v.data.status };
  return proposed(ctx, 'creator.create', payload, `Add creator ${payload.name} (${payload.email}), status ${payload.status}`);
};

const FORM_FIELD: Record<(typeof EDIT_FIELDS)[number], CreatorField> = { full_name: 'name', channel_url: 'channel_url', niche: 'niche', subscribers: 'subscribers', status: 'status' };

const proposeEditCreator: Handler = async (input, ctx) => {
  const p = z.object({
    creator_id: id, full_name: z.string().optional(), channel_url: z.string().optional(), niche: z.string().optional(),
    subscribers: z.number().optional(), status: z.enum(STATUSES).optional(),
  }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  const { data: cur } = await ctx.supabase.from('creators').select('full_name, email, phone, channel_url, niche, subscribers, status, notes').eq('id', p.data.creator_id).maybeSingle();
  if (!cur) return fail('No creator with that id.');

  const changes: UpdatePayload['changes'] = {};
  const from: UpdatePayload['from'] = {};
  for (const k of EDIT_FIELDS) {
    const want = p.data[k];
    if (want === undefined) continue;
    const have = cur[k] ?? null;
    if (have === want) continue;
    changes[k] = want;
    from[k] = have;
  }
  const keys = EDIT_FIELDS.filter((k) => k in changes);
  if (keys.length === 0) return fail('That is already how the creator is. Nothing to change.');
  if (cur.status === 'do_not_contact' && changes.status !== undefined && changes.status !== 'do_not_contact') {
    return fail('This creator is marked do not contact. Their status cannot be moved to another status.');
  }
  const raw = { name: cur.full_name, email: cur.email, phone: cur.phone, channel_url: cur.channel_url, niche: cur.niche, subscribers: cur.subscribers, status: cur.status, notes: cur.notes } as Record<CreatorField, unknown>;
  for (const k of keys) raw[FORM_FIELD[k]] = changes[k];
  const v = validateCreator(raw);
  if (!v.ok) for (const k of keys) { const msg = v.errors[FORM_FIELD[k]]; if (msg) return fail(msg); }

  const label = (k: (typeof EDIT_FIELDS)[number]) => `${k === 'full_name' ? 'name' : k}: ${from[k] ?? 'none'} to ${changes[k]}`;
  const payload: UpdatePayload = { creator_id: p.data.creator_id, changes, from };
  return proposed(ctx, 'creator.update', payload, `Edit ${cur.full_name}: ${keys.map(label).join('; ')}`);
};

const proposeDealStage: Handler = async (input, ctx) => {
  const p = z.object({ deal_id: id, stage: z.enum(STAGES) }).safeParse(input);
  if (!p.success) return fail('Invalid input.');
  const { data } = await ctx.supabase.from('deals').select('id, stage, creators(full_name), brands(name)').eq('id', p.data.deal_id).maybeSingle();
  if (!data) return fail('No deal with that id.');
  if (data.stage === p.data.stage) return fail('The deal is already in that stage.');
  const d = data as unknown as { stage: Stage; creators: { full_name: string } | null; brands: { name: string } | null };
  const payload: StagePayload = { deal_id: p.data.deal_id, stage: p.data.stage, from: d.stage };
  return proposed(ctx, 'deal.stage', payload, `Move the ${d.brands?.name ?? 'brand'} deal with ${d.creators?.full_name ?? 'a creator'} from ${STAGE_LABEL[d.stage]} to ${STAGE_LABEL[p.data.stage]}`);
};

const HANDLERS: Record<string, Handler> = {
  get_overview_stats: stats, search_creators: searchCreators, get_creator: getCreator, list_deals: listDeals,
  list_emails: listEmails, list_templates: listTemplates, list_inbox: listInbox, create_email_draft: createEmailDraft,
  propose_add_creator: proposeAddCreator, propose_edit_creator: proposeEditCreator, propose_deal_stage: proposeDealStage,
};

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) return fail('Unknown tool.');
  try {
    return await handler(input, ctx);
  } catch (e) {
    console.error('assistant tool failed', name, e instanceof Error ? e.message : e);
    return fail('The tool failed. Try again or ask the owner to do it on the page.');
  }
}
