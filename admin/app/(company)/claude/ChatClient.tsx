'use client';
// The chat. Sends the message, reads the streamed events and shows live step lines, drafts and proposal cards.
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge, Button, Notice } from '@/components/ui';
import type { ChatItem } from '@/lib/assistant/display';
import type { AssistantEvent, ProposalView } from '@/lib/assistant/types';
import s from './claude.module.css';

type Item = ChatItem | { kind: 'notice'; text: string };

export function ChatClient({ threadId, connected, initialItems, initialProposals }: {
  threadId: string | null; connected: boolean; initialItems: ChatItem[]; initialProposals: ProposalView[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [proposals, setProposals] = useState<Record<string, ProposalView>>(() => Object.fromEntries(initialProposals.map((p) => [p.id, p])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const thread = useRef<string | null>(threadId);
  const box = useRef<HTMLTextAreaElement>(null);

  const add = (i: Item) => setItems((x) => [...x, i]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = (box.current?.value ?? '').trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    add({ kind: 'user', text: message });
    if (box.current) box.current.value = '';
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: thread.current ?? undefined, message }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? 'Something went wrong.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handle(JSON.parse(line) as AssistantEvent);
        }
      }
    } catch {
      setError('The connection was lost. Reload the page to see what happened.');
    } finally {
      setBusy(false);
    }
  }

  function handle(ev: AssistantEvent) {
    if (ev.type === 'thread') {
      thread.current = ev.id;
      window.history.replaceState(null, '', `/claude?t=${ev.id}`);
    } else if (ev.type === 'step') add({ kind: 'step', label: ev.label, ok: ev.ok });
    else if (ev.type === 'text') add({ kind: 'assistant', text: ev.text });
    else if (ev.type === 'draft') add({ kind: 'draft', emailId: ev.emailId, creator: ev.creator });
    else if (ev.type === 'proposal') {
      setProposals((p) => ({ ...p, [ev.proposal.id]: ev.proposal }));
      add({ kind: 'proposal', id: ev.proposal.id });
    } else if (ev.type === 'notice') add({ kind: 'notice', text: ev.text });
    else if (ev.type === 'error') setError(ev.message);
  }

  async function decide(id: string, action: 'approve' | 'reject') {
    setError('');
    const res = await fetch(`/api/assistant/proposals/${id}/${action}`, { method: 'POST' });
    const j = await res.json().catch(() => null);
    if (j?.proposal) setProposals((p) => ({ ...p, [id]: j.proposal }));
    else setError(j?.error ?? 'Something went wrong.');
  }

  return (
    <>
      <div className={s.log} aria-live="polite">
        {items.length === 0 ? <p className="muted">Try: &ldquo;How is the business doing?&rdquo;, &ldquo;Find creators in cooking&rdquo; or &ldquo;Draft an intro email to &hellip;&rdquo;.</p> : null}
        {items.map((it, i) => <Row key={i} item={it} proposals={proposals} decide={decide} />)}
        {busy ? <div className={s.step} role="status" data-from="working">Working&hellip;</div> : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form onSubmit={send} className={s.form}>
        <label className="sr-only" htmlFor="claude-message">Message to Claude</label>
        <textarea id="claude-message" ref={box} name="message" maxLength={4000} placeholder="Ask Claude…" disabled={!connected || busy}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <div className={s.actions}><Button type="submit" loading={busy} disabled={!connected}>Send</Button></div>
      </form>
    </>
  );
}

function Row({ item, proposals, decide }: { item: Item; proposals: Record<string, ProposalView>; decide: (id: string, a: 'approve' | 'reject') => Promise<void> }) {
  switch (item.kind) {
    case 'user': return <div className={s.you} data-from="you">{item.text}</div>;
    case 'assistant': return <div className={s.claude} data-from="claude">{item.text}</div>;
    case 'step': return <div className={`${s.step} ${item.ok ? '' : s.stepBad}`} data-from="step">{item.label}{item.ok ? '' : ' (did not work)'}</div>;
    case 'notice': return <div data-from="notice"><Notice tone="warn">{item.text}</Notice></div>;
    case 'draft': return (
      <div className={s.card} data-from="draft">
        <div><strong>Draft saved{item.creator ? ` for ${item.creator}` : ''}.</strong> <span className="muted">Nothing has been sent.</span></div>
        <div className={s.actions}><Link href="/emails/review" className="auth__linkbtn">Open Review to read, approve and send it</Link></div>
      </div>
    );
    case 'proposal': return <ProposalCard p={proposals[item.id]} decide={decide} />;
  }
}

function ProposalCard({ p, decide }: { p?: ProposalView; decide: (id: string, a: 'approve' | 'reject') => Promise<void> }) {
  const [working, setWorking] = useState(false);
  if (!p) return null;
  const run = async (a: 'approve' | 'reject') => { setWorking(true); try { await decide(p.id, a); } finally { setWorking(false); } };
  return (
    <div className={s.card} role="group" aria-label="Proposed change" data-from="proposal" data-status={p.status}>
      <div className={s.actions}>
        <Badge tone={p.status === 'approved' ? 'good' : p.status === 'pending' ? 'warn' : p.status === 'failed' ? 'bad' : 'neutral'}>
          {p.status === 'pending' ? 'Waiting for you' : p.status === 'approved' ? 'Approved' : p.status === 'rejected' ? 'Rejected' : 'Failed'}
        </Badge>
      </div>
      {p.detail ? (
        <div data-part="detail">
          <strong>{p.detail.title}</strong>{p.detail.subject ? <> <span className="muted">&middot;</span> {p.detail.subject}</> : null}
          <ul className={s.changes}>
            {p.detail.changes.map((c) => (
              <li key={c.label}>
                <span className="muted">{c.label}: </span>
                {c.from === null ? <span data-part="to">{c.to}</span> : <><span data-part="from">{c.from}</span> <span aria-label="changes to">&rarr;</span> <span data-part="to">{c.to}</span></>}
              </li>
            ))}
          </ul>
        </div>
      ) : <div>This proposal cannot be shown. Reject it and ask Claude again.</div>}
      {p.error ? <Notice tone="error">{p.error}</Notice> : null}
      {p.status === 'pending' ? (
        <div className={s.actions}>
          <Button size="sm" loading={working} onClick={() => run('approve')}>Approve</Button>
          <Button size="sm" variant="ghost" disabled={working} onClick={() => run('reject')}>Reject</Button>
        </div>
      ) : null}
    </div>
  );
}
