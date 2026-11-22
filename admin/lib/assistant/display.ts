// Turns stored messages into what the page shows. Pure (no server-only), so the server page can use it.
import { unwrap } from './untrusted';
import { toolLabel } from './types';

type Block = { type: string; [k: string]: unknown };
export type StoredLike = { role: 'user' | 'assistant'; content: Block[] };

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'step'; label: string; ok: boolean }
  | { kind: 'draft'; emailId: string; creator: string }
  | { kind: 'proposal'; id: string };

function parseJson(v: unknown): Record<string, unknown> | null {
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : null;
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildItems(messages: StoredLike[]): ChatItem[] {
  const items: ChatItem[] = [];
  const tools = new Map<string, string>(); // tool_use id -> tool name
  for (const m of messages) {
    for (const b of m.content) {
      if (m.role === 'user' && b.type === 'text') items.push({ kind: 'user', text: String(b.text ?? '') });
      else if (m.role === 'assistant' && b.type === 'text' && String(b.text ?? '').trim()) items.push({ kind: 'assistant', text: String(b.text) });
      else if (m.role === 'assistant' && b.type === 'tool_use') tools.set(String(b.id), String(b.name));
      else if (m.role === 'user' && b.type === 'tool_result') {
        const name = tools.get(String(b.tool_use_id)) ?? '';
        const ok = b.is_error !== true;
        items.push({ kind: 'step', label: toolLabel(name), ok });
        const data = ok ? parseJson(b.content) : null;
        if (name === 'create_email_draft' && data?.email_id) items.push({ kind: 'draft', emailId: String(data.email_id), creator: unwrap(data.creator) });
        if (name.startsWith('propose_') && data?.proposal_id) items.push({ kind: 'proposal', id: String(data.proposal_id) });
      }
    }
  }
  return items;
}
