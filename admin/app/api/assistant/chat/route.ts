// POST /api/assistant/chat  { thread_id?, message }  — owner only.
// Streams newline-delimited JSON events (thread, step, text, draft, proposal, notice, done, error) while Claude works.
import { z } from 'zod';
import { ApiError, apiHandler } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { dailyLimit, isConnected } from '@/lib/assistant/client';
import { ownerMessagesToday } from '@/lib/assistant/history';
import { runTurn } from '@/lib/assistant/loop';
import type { AssistantEvent } from '@/lib/assistant/types';

export const maxDuration = 300;

const LOCK_MINUTES = 6;

export const POST = apiHandler(
  { role: 'owner', body: z.object({ thread_id: z.guid().optional(), message: z.string().trim().min(1).max(4000) }) },
  async ({ staff, supabase, body }) => {
    if (!isConnected()) throw new ApiError(400, 'Claude is not connected. Add ANTHROPIC_API_KEY to the server settings.');
    if ((await ownerMessagesToday(supabase)) >= dailyLimit()) {
      throw new ApiError(429, `You have reached today's limit of ${dailyLimit()} messages. It resets at midnight UTC.`);
    }

    let threadId = body.thread_id;
    if (threadId) {
      const { data } = await supabase.from('assistant_threads').select('id').eq('id', threadId).maybeSingle();
      if (!data) throw new ApiError(404, 'Conversation not found.');
    } else {
      const { data, error } = await supabase.from('assistant_threads').insert({ title: body.message.replace(/\s+/g, ' ').slice(0, 60) }).select('id').single();
      if (error || !data) throw new Error('could not create the conversation');
      threadId = data.id as string;
    }
    const tid: string = threadId;

    // One request per conversation at a time, so two messages cannot interleave their tool calls.
    const lock = () => supabase.from('assistant_threads').update({ locked_at: new Date().toISOString() }).eq('id', tid);
    let { data: locked } = await lock().is('locked_at', null).select('id');
    if (!locked?.length) {
      // A lock older than LOCK_MINUTES belongs to a request that died; take it over.
      ({ data: locked } = await lock().lt('locked_at', new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString()).select('id'));
    }
    if (!locked?.length) throw new ApiError(409, 'Claude is still working on the previous message in this conversation.');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let open = true;
        const emit = (e: AssistantEvent) => {
          if (!open) return; // the browser went away; keep working so the stored conversation stays complete
          try { controller.enqueue(encoder.encode(JSON.stringify(e) + '\n')); } catch { open = false; }
        };
        let tools: string[] = [];
        try {
          emit({ type: 'thread', id: tid });
          tools = (await runTurn({ supabase, staff, threadId: tid, text: body.message, emit })).tools;
        } catch (e) {
          console.error('assistant turn failed', e instanceof Error ? e.message : e);
          emit({ type: 'error', message: 'Something went wrong. Try again.' });
        } finally {
          await supabase.from('assistant_threads').update({ locked_at: null, updated_at: new Date().toISOString() }).eq('id', tid);
          await logAudit('assistant.message', 'assistant_thread', tid, { thread: tid, tools });
          emit({ type: 'done' });
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
    });
  },
);
