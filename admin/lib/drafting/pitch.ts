// Pitch drafting entry point. SERVER ONLY: it reads the Anthropic key.
//   draftPitch(facts, knownNames) -> { ok: true, draft } | { ok: false, error, reason }
// Mock mode (no key, or DRAFT_MODE=mock) never calls the network. The same limits as the first-contact drafts:
// 25 seconds per try, one retry. A draft that fails the pitch checks is never returned.
import 'server-only';
import { createAnthropic } from '@/lib/anthropic';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { isMockMode } from './index';
import { mockPitch } from './pitch-mock';
import { buildPitchUserPrompt, PITCH_SYSTEM_PROMPT } from './pitch-prompt';
import { pitchProblem } from './pitch-validate';
import type { PitchFacts } from './pitch-types';
import type { DraftResult } from './types';
import { cleanDraft } from './validate';

const Output = z.object({ subject: z.string(), body: z.string() });

export async function draftPitch(facts: PitchFacts, knownNames: string[] = []): Promise<DraftResult> {
  // A sponsor name that was held back as unsafe (see pitch-facts) leaves the name empty: nothing is drafted.
  if (!facts.sponsor.name.trim()) return { ok: false, error: 'The sponsor\u2019s name could not be used in a draft.', reason: 'checks' };
  let raw: { subject: string; body: string };
  try {
    if (isMockMode()) {
      raw = mockPitch(facts);
    } else {
      const client = createAnthropic({ timeout: 25_000, maxRetries: 1 });
      const res = await client.messages.parse({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        system: PITCH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPitchUserPrompt(facts) }],
        output_config: { effort: 'low', format: zodOutputFormat(Output) },
      });
      if (res.stop_reason === 'refusal' || !res.parsed_output) return { ok: false, error: 'Claude did not return a draft.', reason: 'refused' };
      raw = res.parsed_output;
    }
  } catch (e) {
    console.error('pitch drafting failed', e instanceof Error ? e.name : 'error');
    return { ok: false, error: 'The drafting service failed. Try again.', reason: 'down' };
  }
  const draft = cleanDraft(raw);
  const problem = pitchProblem(draft, facts, { knownNames });
  if (problem) return { ok: false, error: problem, reason: 'checks' };
  return { ok: true, draft };
}
