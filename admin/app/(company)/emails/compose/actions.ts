'use server';
// Drafts one email per selected creator and saves them as status "draft". Never sends.
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { creatorsByIds } from '@/lib/email/creators';
import { draftEmail, isMockMode, type Instruction } from '@/lib/drafting';
import { toFacts } from '@/lib/drafting/facts';

export type ComposeState = { error?: string };

const MAX_CREATORS = 25;
// The host stops a long request, so no new batch starts after this long; the rest is reported as not drafted.
const START_BATCHES_UNTIL_MS = 40_000;
const Input = z.object({
  creators: z.array(z.guid()).min(1, 'Pick at least one creator.').max(MAX_CREATORS, `Pick at most ${MAX_CREATORS} creators per run.`),
  mode: z.enum(['template', 'goal']),
  templateId: z.string().optional(),
  goal: z.string().trim().max(500).optional(),
});

export async function draftAction(_prev: ComposeState, form: FormData): Promise<ComposeState> {
  const staff = await requireStaff();
  const parsed = Input.safeParse({
    creators: form.getAll('creators'),
    mode: form.get('mode'),
    templateId: String(form.get('templateId') ?? ''),
    goal: String(form.get('goal') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const supabase = await createClient();

  // The instruction: a saved template or the typed goal.
  let instruction: Instruction;
  let templateId: string | null = null;
  if (input.mode === 'template') {
    const { data: t } = await supabase.from('email_templates').select('id, subject, body').eq('id', input.templateId ?? '').maybeSingle();
    if (!t) return { error: 'Choose a template.' };
    instruction = { kind: 'template', subject: t.subject, body: t.body };
    templateId = t.id;
  } else {
    if (!input.goal) return { error: 'Write the goal in one sentence.' };
    instruction = { kind: 'goal', goal: input.goal };
  }

  // Blocked creators are skipped here as well (the database refuses them too).
  const creators = await creatorsByIds(supabase, input.creators);
  const allowed = creators.filter((c) => !c.blocked);
  // Why drafts failed, as short codes with counts (names are not put in the address).
  const failed: Record<string, number> = {};
  const fail = (code: string, n = 1) => { failed[code] = (failed[code] ?? 0) + n; };
  fail('blocked', creators.length - allowed.length);
  const mock = isMockMode();
  // 'template' for template and mock drafts, 'claude' for a goal written by Claude.
  const source = mock || instruction.kind === 'template' ? 'template' : 'claude';
  let saved = 0;
  const started = Date.now();

  // A few at a time: faster than one by one, gentle on the API rate limit.
  for (let i = 0; i < allowed.length; i += 5) {
    if (Date.now() - started > START_BATCHES_UNTIL_MS) {
      fail('late', allowed.length - i);
      break;
    }
    await Promise.all(
      allowed.slice(i, i + 5).map(async (c) => {
        const result = await draftEmail(toFacts(c), instruction);
        if (!result.ok) return void fail(result.reason);
        const { data, error } = await supabase
          .from('emails')
          .insert({ creator_id: c.id, to_email: c.email, subject: result.draft.subject, body: result.draft.body, template_id: templateId, source })
          .select('id')
          .single();
        if (error || !data) return void fail('save');
        saved += 1;
        await logAudit('email.drafted', 'email', data.id, { mock, by: staff.email });
      }),
    );
  }

  const q = new URLSearchParams({ drafted: String(saved), mock: mock ? '1' : '0' });
  const codes = Object.entries(failed).filter(([, n]) => n > 0).map(([code, n]) => `${code}-${n}`);
  if (codes.length) q.set('failed', codes.join(','));
  redirect(`/emails/review?${q}`);
}
