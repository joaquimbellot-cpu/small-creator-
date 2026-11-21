// Drafting entry point. SERVER ONLY: it reads the Anthropic key.
//   draftEmail(creator, instruction) -> { ok: true, draft } | { ok: false, error }
// Mock mode (no key, or DRAFT_MODE=mock) never calls the network.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { mockDraft } from './mock';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt';
import type { CreatorFacts, DraftResult, Instruction } from './types';
import { cleanDraft, draftProblem } from './validate';

export type { CreatorFacts, Instruction } from './types';

export function isMockMode(): boolean {
  return process.env.DRAFT_MODE === 'mock' || !process.env.ANTHROPIC_API_KEY;
}

const Output = z.object({ subject: z.string(), body: z.string() });

export async function draftEmail(creator: CreatorFacts, instruction: Instruction): Promise<DraftResult> {
  let raw: { subject: string; body: string };
  try {
    if (isMockMode()) {
      raw = mockDraft(creator, instruction);
    } else {
      const client = new Anthropic(); // reads ANTHROPIC_API_KEY
      const res = await client.messages.parse({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(creator, instruction) }],
        output_config: { effort: 'low', format: zodOutputFormat(Output) },
      });
      if (res.stop_reason === 'refusal' || !res.parsed_output) return { ok: false, error: 'Claude did not return a draft.' };
      raw = res.parsed_output;
    }
  } catch (e) {
    // Log the type only; the message could contain request details.
    console.error('drafting failed', e instanceof Error ? e.name : 'error');
    return { ok: false, error: 'The drafting service failed. Try again.' };
  }
  const problem = draftProblem(raw);
  if (problem) return { ok: false, error: problem };
  return { ok: true, draft: cleanDraft(raw) };
}
