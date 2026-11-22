import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { EmptyState, Notice } from '@/components/ui';
import { requireOwner } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { isConnected } from '@/lib/assistant/client';
import { buildItems } from '@/lib/assistant/display';
import { loadMessages } from '@/lib/assistant/history';
import { proposalsForThread } from '@/lib/assistant/proposals';
import { ChatClient } from './ChatClient';
import s from './claude.module.css';

export const metadata: Metadata = { title: 'Claude' };

export default async function ClaudePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: threads } = await supabase.from('assistant_threads').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(30);
  const wanted = z.guid().safeParse(sp.t);
  const current = wanted.success ? (threads ?? []).find((t) => t.id === wanted.data) : undefined;
  const [messages, proposals] = current
    ? await Promise.all([loadMessages(supabase, current.id), proposalsForThread(supabase, current.id)])
    : [[], []];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Claude</h1>
          <p className="page-lead">Ask about your creators, deals and emails. Claude can write drafts and propose changes. You approve every change, and you send every email yourself.</p>
        </div>
      </div>
      {!isConnected() ? (
        <Notice tone="warn" title="Claude is not connected.">
          {' '}Add your Anthropic key as <code>ANTHROPIC_API_KEY</code> in the server environment (for local work, in <code>admin/.env.local</code>) and restart the app.
        </Notice>
      ) : null}
      <div className={s.layout}>
        <nav className={s.threads} aria-label="Conversations">
          <Link href="/claude" className={s.newChat} aria-current={current ? undefined : 'page'}>New conversation</Link>
          {(threads ?? []).length === 0 ? <p className="muted">No conversations yet.</p> : null}
          {(threads ?? []).map((t) => (
            <Link key={t.id} href={`/claude?t=${t.id}`} className={s.thread} aria-current={t.id === current?.id ? 'page' : undefined}>
              {t.title || 'Untitled'}
            </Link>
          ))}
        </nav>
        <section className={s.chat} aria-label="Chat">
          {wanted.success && !current ? <EmptyState title="Conversation not found">Pick one from the list or start a new one.</EmptyState> : (
            <ChatClient threadId={current?.id ?? null} connected={isConnected()} initialItems={buildItems(messages)} initialProposals={proposals} />
          )}
        </section>
      </div>
    </>
  );
}
