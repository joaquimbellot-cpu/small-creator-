// One owner message: call Claude, run the tools it asks for, repeat (at most 12 steps). SERVER ONLY.
// Manual loop, non-streaming. Each assistant response.content is stored exactly as returned, and the history is
// replayed unchanged and append-only (thinking blocks included). All tool_result blocks of one step go back in one user message.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Staff } from '@/lib/auth/staff';
import { assistantModel, createAnthropic, deadlineMs, MAX_STEPS, MAX_TOKENS } from './client';
import { appendMessage, loadMessages, MAX_STORED_MESSAGES, repairDanglingToolUse, type Block } from './history';
import { SYSTEM_PROMPT } from './prompt';
import { runTool, seenIds, TOOLS, type ToolContext } from './tools';
import { toolLabel, type AssistantEvent } from './types';


export type TurnResult = { tools: string[]; creators: string[]; inbox: string[] };

export async function runTurn(opts: {
  supabase: SupabaseClient; staff: Staff; threadId: string; text: string; emit: (e: AssistantEvent) => void;
  /** Filled when the turn ends, also when it throws. */
  out: TurnResult;
}): Promise<TurnResult> {
  const { supabase, threadId, emit } = opts;
  const used: string[] = [];
  const started = Date.now();
  const deadline = deadlineMs();

  const stored = await loadMessages(supabase, threadId);
  if (stored.length > MAX_STORED_MESSAGES) {
    emit({ type: 'error', message: 'This conversation is very long. Start a new one.' });
    return { tools: used, creators: [], inbox: [] };
  }
  await repairDanglingToolUse(supabase, threadId, stored);
  const userBlock: Block[] = [{ type: 'text', text: opts.text }];
  await appendMessage(supabase, threadId, 'user', userBlock);
  const history = [...stored.map((m) => ({ role: m.role, content: m.content })), { role: 'user' as const, content: userBlock }];

  const client = createAnthropic();
  const ctx: ToolContext = { supabase, staff: opts.staff, threadId, emit, draftsMade: 0, seen: { creators: new Set(), inbox: new Set() } };

  try {
    for (let step = 1; step <= MAX_STEPS; step++) {
      // Stop before the host stops the request: each call gets only the time that is left.
      const left = deadline - (Date.now() - started);
      if (left < 8_000) {
        emit({ type: 'notice', text: 'That is taking too long, so I stopped. Send another message to continue.' });
        break;
      }
      let res: BetaMessage;
      try {
        res = await client.beta.messages.create({
          betas: ['server-side-fallback-2026-07-01'],
          model: assistantModel(),
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: history as unknown as BetaMessageParam[],
          output_config: { effort: 'medium' },
          fallbacks: 'default',
          cache_control: { type: 'ephemeral' },
        }, { timeout: Math.min(120_000, left - 3_000) });
      } catch (e) {
        // Log the type and status only; the message could contain request details.
        console.error('assistant call failed', e instanceof Error ? e.name : 'error', e instanceof Anthropic.APIError ? e.status : '');
        if (e instanceof Anthropic.APIConnectionTimeoutError) {
          emit({ type: 'notice', text: 'That is taking too long, so I stopped. Send another message to continue.' });
          break;
        }
        emit({ type: 'error', message: e instanceof Anthropic.RateLimitError ? 'Claude is busy right now. Try again in a minute.' : 'Claude could not be reached. Try again.' });
        break;
      }

      // Check why it stopped before reading the content.
      const content = res.content as unknown as Block[];
      const toolCalls = content.filter((b) => b.type === 'tool_use');

      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
        // Never run tools from a turn that was cut off. Keep the turn only if it is harmless to replay.
        if (content.length > 0 && toolCalls.length === 0) await appendMessage(supabase, threadId, 'assistant', content);
        emit({ type: 'notice', text: res.stop_reason === 'refusal' ? 'Claude declined to answer that.' : 'The answer was too long and was cut off. Try asking for less at a time.' });
        emitText(content, emit);
        break;
      }

      await appendMessage(supabase, threadId, 'assistant', content);
      history.push({ role: 'assistant', content });
      emitText(content, emit);

      if (res.stop_reason !== 'tool_use' || toolCalls.length === 0) break;

      // Run every tool of this step, then answer them all in ONE user message.
      const results: Block[] = [];
      for (const call of toolCalls) {
        const name = String(call.name);
        used.push(name);
        const r = await runTool(name, call.input, ctx);
        emit({ type: 'step', tool: name, label: toolLabel(name), ok: !r.isError });
        results.push({ type: 'tool_result', tool_use_id: String(call.id), content: r.text, ...(r.isError ? { is_error: true } : {}) });
      }
      await appendMessage(supabase, threadId, 'user', results);
      history.push({ role: 'user', content: results });

      if (step === MAX_STEPS) emit({ type: 'notice', text: `I stopped after ${MAX_STEPS} steps. Send another message to continue.` });
    }
  } finally {
    // Also when the turn throws: what Claude already saw still goes into the audit line.
    Object.assign(opts.out, { tools: used, ...seenIds(ctx) });
  }
  return { tools: used, ...seenIds(ctx) };
}

function emitText(content: Block[], emit: (e: AssistantEvent) => void) {
  const text = content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n\n').trim();
  if (text) emit({ type: 'text', text });
}
