// Proposals: changes Claude suggests and the owner approves with a click. SERVER ONLY.
// Claude never writes to creators or deals. It stores a pending proposal; Approve runs here, as the owner, through
// the same validation and database path the screens use, after re-checking the current state.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { validateCreator, type CreatorField } from '@/lib/creators/schema';
import { updateStageSchema } from '@/lib/deals/schemas';
import { STAGE_LABEL, type Stage } from '@/lib/deals/format';
import { ApiError } from '@/lib/api/handler';
import { cleanText } from './untrusted';
import { STATUS_LABEL } from '@/lib/creators/constants';
import type { ProposalChange, ProposalDetail, ProposalKind, ProposalStatus, ProposalView } from './types';

type Db = SupabaseClient;
const COLS = 'id, kind, summary, status, result, payload';
type Row = { id: string; kind: ProposalKind; summary: string; status: ProposalStatus; result: { error?: string } | null; payload: unknown };

const FIELD_LABEL: Record<EditField, string> = { full_name: 'Name', channel_url: 'YouTube link', niche: 'Niche', subscribers: 'Subscribers', status: 'Status' };
const show = (k: string, v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return 'empty';
  if (k === 'status') return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? String(v);
  if (k === 'subscribers' && typeof v === 'number') return v.toLocaleString('en-US');
  return String(v);
};

// Built from the stored payload (and the current names), not from Claude's text. All values are plain text.
async function detailOf(supabase: Db, r: Row): Promise<ProposalDetail | null> {
  try {
    if (r.kind === 'creator.create') {
      const p = createSchema.parse(r.payload);
      const changes: ProposalChange[] = [
        { label: 'Name', from: null, to: show('', p.name) },
        { label: 'Email', from: null, to: show('', p.email) },
        { label: 'YouTube link', from: null, to: show('', p.channel_url) },
        { label: 'Niche', from: null, to: show('', p.niche) },
        { label: 'Subscribers', from: null, to: show('subscribers', p.subscribers) },
        { label: 'Status', from: null, to: show('status', p.status) },
      ];
      return { title: 'Add a new creator', subject: null, changes };
    }
    if (r.kind === 'creator.update') {
      const p = updateSchema.parse(r.payload);
      const { data } = await supabase.from('creators').select('full_name').eq('id', p.creator_id).maybeSingle();
      const changes = EDIT_FIELDS.filter((k) => k in p.changes).map((k) => ({ label: FIELD_LABEL[k], from: show(k, p.from[k]), to: show(k, p.changes[k]) }));
      return { title: 'Change a creator', subject: (data?.full_name as string | undefined) ?? null, changes };
    }
    const p = stageSchema.parse(r.payload);
    const { data } = await supabase.from('deals').select('creators(full_name), brands(name)').eq('id', p.deal_id).maybeSingle();
    const d = data as { creators?: { full_name?: string } | null; brands?: { name?: string } | null } | null;
    const subject = d ? [d.creators?.full_name, d.brands?.name].filter(Boolean).join(' / ') || null : null;
    const label = (x: string) => STAGE_LABEL[x as Stage] ?? x;
    return { title: 'Move a deal to another stage', subject, changes: [{ label: 'Stage', from: label(p.from), to: label(p.stage) }] };
  } catch {
    return null;
  }
}

const view = async (supabase: Db, r: Row): Promise<ProposalView> => ({
  id: r.id, kind: r.kind, detail: await detailOf(supabase, r), status: r.status, error: r.result?.error ?? null,
});

// ---- payloads (what is stored with a proposal)
export const EDIT_FIELDS = ['full_name', 'channel_url', 'niche', 'subscribers', 'status'] as const;
type EditField = (typeof EDIT_FIELDS)[number];
type Edit = Partial<Record<EditField, string | number | null>>;

export type CreatePayload = { name: string; email: string; channel_url: string | null; niche: string | null; subscribers: number | null; status: string };
export type UpdatePayload = { creator_id: string; changes: Edit; from: Edit };
export type StagePayload = { deal_id: string; stage: Stage; from: Stage };

const createSchema = z.object({
  name: z.string(), email: z.string(), channel_url: z.string().nullable(), niche: z.string().nullable(),
  subscribers: z.number().int().nullable(), status: z.string(),
});
const updateSchema = z.object({ creator_id: z.guid(), changes: z.record(z.string(), z.union([z.string(), z.number(), z.null()])), from: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) });
const stageSchema = z.object({ deal_id: z.guid(), stage: z.string(), from: z.string() });

export async function createProposal(supabase: Db, threadId: string, kind: ProposalKind, payload: object, summary: string): Promise<ProposalView> {
  const { data, error } = await supabase
    .from('assistant_proposals')
    .insert({ thread_id: threadId, kind, payload, summary: cleanText(summary, 480) })
    .select(COLS)
    .single();
  if (error || !data) throw new Error('could not store the proposal');
  return view(supabase, data as Row);
}

export async function proposalsForThread(supabase: Db, threadId: string): Promise<ProposalView[]> {
  const { data } = await supabase.from('assistant_proposals').select(COLS).eq('thread_id', threadId).order('created_at');
  return Promise.all(((data ?? []) as Row[]).map((r) => view(supabase, r)));
}

// ---- decisions
export async function rejectProposal(supabase: Db, staffId: string, id: string): Promise<ProposalView> {
  const { data, error } = await supabase
    .from('assistant_proposals')
    .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: staffId })
    .eq('id', id).eq('status', 'pending')
    .select(COLS);
  if (error) throw new Error('could not reject the proposal');
  if (!data?.length) throw new ApiError(409, 'This proposal was already decided.');
  await logAudit('assistant.proposal_rejected', 'assistant_proposal', id, { kind: (data[0] as Row).kind });
  return view(supabase, data[0] as Row);
}

export async function approveProposal(supabase: Db, staffId: string, id: string): Promise<ProposalView> {
  // Claim it first (pending -> approved) so a double click cannot run it twice.
  const { data: claimed, error } = await supabase
    .from('assistant_proposals')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: staffId })
    .eq('id', id).eq('status', 'pending')
    .select(COLS);
  if (error) throw new Error('could not approve the proposal');
  if (!claimed?.length) throw new ApiError(409, 'This proposal was already decided.');
  const row = claimed[0] as Row;

  let outcome: { ok: true } | { ok: false; error: string };
  try {
    outcome = await execute(supabase, row);
  } catch (e) {
    console.error('proposal failed', row.kind, e instanceof Error ? e.message : e);
    outcome = { ok: false, error: 'Something went wrong. Nothing was changed.' };
  }
  if (outcome.ok) {
    await supabase.from('assistant_proposals').update({ result: { ok: true } }).eq('id', id);
    await logAudit('assistant.proposal_approved', 'assistant_proposal', id, { kind: row.kind });
    return view(supabase, { ...row, status: 'approved', result: {} });
  }
  await supabase.from('assistant_proposals').update({ status: 'failed', result: { error: outcome.error } }).eq('id', id);
  return view(supabase, { ...row, status: 'failed', result: { error: outcome.error } });
}

type Outcome = { ok: true } | { ok: false; error: string };
const no = (error: string): Outcome => ({ ok: false, error });
const CHANGED = 'The creator was changed after this was proposed. Ask Claude again.';

async function execute(supabase: Db, row: Row): Promise<Outcome> {
  if (row.kind === 'creator.create') return executeCreate(supabase, createSchema.parse(row.payload));
  if (row.kind === 'creator.update') return executeUpdate(supabase, updateSchema.parse(row.payload) as UpdatePayload);
  return executeStage(supabase, stageSchema.parse(row.payload) as StagePayload);
}

async function executeCreate(supabase: Db, p: CreatePayload): Promise<Outcome> {
  const v = validateCreator({ name: p.name, email: p.email, channel_url: p.channel_url, niche: p.niche, subscribers: p.subscribers, status: p.status });
  if (!v.ok) return no(Object.values(v.errors)[0] ?? 'Invalid creator.');
  const { error } = await supabase.from('creators').insert(v.data);
  if (error) return no(error.code === '23505' ? 'A creator with this email already exists.' : 'Could not add the creator.');
  return { ok: true };
}

const FIELD_TO_FORM: Record<EditField, CreatorField> = { full_name: 'name', channel_url: 'channel_url', niche: 'niche', subscribers: 'subscribers', status: 'status' };

async function executeUpdate(supabase: Db, p: UpdatePayload): Promise<Outcome> {
  const { data: cur } = await supabase.from('creators').select('full_name, email, phone, channel_url, niche, subscribers, status, notes').eq('id', p.creator_id).maybeSingle();
  if (!cur) return no('The creator no longer exists.');
  const keys = EDIT_FIELDS.filter((k) => k in p.changes);
  if (keys.length === 0) return no('Nothing to change.');
  // The state must still be what it was when Claude proposed the change.
  for (const k of keys) {
    if ((cur[k] ?? null) !== (p.from[k] ?? null)) return no(CHANGED);
  }
  const next = p.changes.status;
  if (cur.status === 'do_not_contact' && next !== undefined && next !== 'do_not_contact') {
    return no('This creator is marked do not contact. Their status cannot be changed here.');
  }
  // Same validation as the edit form: start from the stored row, apply the change, validate.
  const raw = {
    name: cur.full_name, email: cur.email, phone: cur.phone, channel_url: cur.channel_url, niche: cur.niche,
    subscribers: cur.subscribers, status: cur.status, notes: cur.notes,
  } as Record<CreatorField, unknown>;
  for (const k of keys) raw[FIELD_TO_FORM[k]] = p.changes[k];
  const v = validateCreator(raw);
  if (!v.ok) {
    for (const k of keys) { const msg = v.errors[FIELD_TO_FORM[k]]; if (msg) return no(msg); }
    return no('The stored creator has other data that does not pass validation. Edit it on the Creators page.');
  }
  const patch: Record<string, unknown> = {};
  for (const k of keys) patch[k] = v.data[k];
  if (keys.includes('channel_url')) patch.youtube_channel_id = null; // same as the edit form
  // The UPDATE itself repeats the "still the same" check, so a change made after the read above cannot be overwritten.
  let upd = supabase.from('creators').update(patch).eq('id', p.creator_id);
  for (const k of keys) {
    const old = p.from[k] ?? null;
    upd = old === null ? upd.is(k, null) : upd.eq(k, old);
  }
  const { data, error } = await upd.select('id');
  if (error) return no('Could not save the change.');
  if (!data?.length) return no(CHANGED);
  return { ok: true };
}

async function executeStage(supabase: Db, p: StagePayload): Promise<Outcome> {
  const parsed = updateStageSchema.safeParse({ id: p.deal_id, stage: p.stage });
  if (!parsed.success) return no('Pick a valid stage.');
  const { data: deal } = await supabase.from('deals').select('stage').eq('id', parsed.data.id).maybeSingle();
  if (!deal) return no('The deal no longer exists.');
  if (deal.stage !== p.from) return no(`The deal is now "${STAGE_LABEL[deal.stage as Stage] ?? deal.stage}". It changed after this was proposed. Ask Claude again.`);
  const { data, error } = await supabase.from('deals').update({ stage: parsed.data.stage }).eq('id', parsed.data.id).eq('stage', p.from).select('id');
  if (error) return no('Could not change the stage.');
  if (!data?.length) return no('The deal changed after this was proposed. Ask Claude again.');
  return { ok: true };
}

