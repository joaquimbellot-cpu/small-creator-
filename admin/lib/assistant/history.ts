// Stored conversation: load it, append to it, keep it valid for the API. SERVER ONLY.
// Messages are append-only. Assistant content is stored exactly as the API returned it and replayed unchanged.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StoredMessage = { id: number; role: 'user' | 'assistant'; content: Block[]; created_at: string };
export type Block = { type: string; [k: string]: unknown };

export const MAX_STORED_MESSAGES = 300;

export async function loadMessages(supabase: SupabaseClient, threadId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('thread_id', threadId)
    .order('id', { ascending: true })
    .limit(MAX_STORED_MESSAGES + 1);
  if (error) throw new Error('could not load the conversation');
  return (data ?? []) as StoredMessage[];
}

export async function appendMessage(supabase: SupabaseClient, threadId: string, role: 'user' | 'assistant', content: Block[]): Promise<void> {
  const { error } = await supabase.from('assistant_messages').insert({ thread_id: threadId, role, content });
  if (error) throw new Error('could not save the conversation');
}

/**
 * If the last stored message is an assistant turn with tool calls nobody answered (the server stopped half way),
 * the API would reject the whole thread. Answer them with an error result, appended like any other message.
 */
export async function repairDanglingToolUse(supabase: SupabaseClient, threadId: string, messages: StoredMessage[]): Promise<void> {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return;
  const calls = last.content.filter((b) => b.type === 'tool_use');
  if (calls.length === 0) return;
  const results: Block[] = calls.map((b) => ({ type: 'tool_result', tool_use_id: String(b.id), is_error: true, content: 'This tool call was interrupted and did not run.' }));
  await appendMessage(supabase, threadId, 'user', results);
  messages.push({ id: last.id + 1, role: 'user', content: results, created_at: new Date().toISOString() });
}

/** How many messages the owner has typed today (UTC day), across all threads. */
export async function ownerMessagesToday(supabase: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('assistant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .eq('content->0->>type', 'text')
    .gte('created_at', start.toISOString());
  if (error) throw new Error('could not count messages');
  return count ?? 0;
}
