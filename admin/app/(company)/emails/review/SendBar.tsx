'use client';
// The ONLY place that starts sending. It runs when a person clicks Send and confirms.
// It sends the approved emails listed on this page one at a time, waits between sends, and
// stops at the first daily-limit error. There are no timers that start by themselves.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Notice } from '@/components/ui';

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

type Log = { text: string; tone: 'success' | 'error' | 'warn' | 'info' };

export type SendItem = { id: string; to: string; subject: string; stale: boolean };

export function SendBar({ items, testMode, testEmail, delaySeconds }: { items: SendItem[]; testMode: boolean; testEmail: string; delaySeconds: number }) {
  const ids = items.map((i) => i.id);
  const stale = items.filter((i) => i.stale).length;
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [log, setLog] = useState<Log | null>(null);
  const stop = useRef(false);

  async function run() {
    setConfirming(false);
    setRunning(true);
    stop.current = false;
    let delay = delaySeconds;
    let sent = 0;
    let failed = 0;
    let unrecorded = '';
    let note: Log | null = null;
    setDone(0);
    for (const id of ids) {
      if (stop.current) { note = { text: 'Stopped. The remaining emails were not sent.', tone: 'warn' }; break; }
      // Try again after "too soon" answers (the server says how long to wait), at most 3 times.
      let result: 'sent' | 'failed' | 'limit' | 'unrecorded' = 'failed';
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`/api/emails/${id}/send`, { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (res.ok) { delay = body.delay_seconds ?? delay; result = 'sent'; break; }
        // The mail WAS sent but could not be recorded: show the server's message and stop, so nobody sends it again.
        if (res.status === 409 && body.reason === 'sent_not_recorded') { result = 'unrecorded'; unrecorded = typeof body.error === 'string' ? body.error : 'The email WAS sent, but it could not be recorded. Do not send it again; tell the owner.'; break; }
        if (res.status === 429 && body.reason === 'daily_limit') { result = 'limit'; break; }
        if (res.status === 429 && body.reason === 'too_soon') { await sleep((body.retry_after_seconds || delay) + 1); continue; }
        break; // any other refusal: this email is skipped, the next one is tried
      }
      if (result === 'unrecorded') { sent++; note = { text: `${unrecorded} Sending stopped. ${sent} sent so far; the remaining emails were not sent.`, tone: 'error' }; break; }
      if (result === 'limit') { note = { text: 'The daily sending limit is reached. Sending stopped.', tone: 'warn' }; break; }
      if (result === 'sent') sent++; else failed++;
      setDone(sent + failed);
      if (id !== ids[ids.length - 1]) await sleep(delay);
    }
    setLog(note ?? { text: `Finished: ${sent} sent${failed ? `, ${failed} not sent (see the email log)` : ''}.`, tone: failed ? 'warn' : 'success' });
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="tile" style={{ marginBottom: 24 }}>
      <Button size="md" disabled={ids.length === 0 || running} onClick={() => setConfirming(true)} style={{ fontSize: '1.125rem', padding: '16px 32px' }}>
        {running ? `Sending ${done + 1} of ${ids.length}…` : `Send ${ids.length} approved`}
      </Button>
      {running ? <Button variant="ghost" onClick={() => { stop.current = true; }} style={{ marginLeft: 8 }}>Stop</Button> : null}
      {ids.length === 0 ? <span className="muted" style={{ marginLeft: 12 }}>Approve at least one email to send.</span> : null}
      {log ? <Notice tone={log.tone}>{log.text}</Notice> : null}
      <Modal open={confirming} onClose={() => setConfirming(false)} title="Send now?" footer={
        <>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button onClick={run} data-autofocus>Send {ids.length}</Button>
        </>
      }>
        <p style={{ margin: 0 }}>
          {ids.length} approved {ids.length === 1 ? 'email' : 'emails'} will be sent, one at a time, {delaySeconds} seconds apart.
          {testMode ? <strong> Test mode: all go to {testEmail}.</strong> : <strong> Test mode is off: these go to the real creators.</strong>}
        </p>
        <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
          {items.slice(0, 10).map((i) => <li key={i.id}>{i.to}: {i.subject}</li>)}
        </ul>
        {items.length > 10 ? <p className="muted" style={{ margin: '4px 0 0' }}>and {items.length - 10} more.</p> : null}
        {stale > 0 ? <p style={{ margin: '12px 0 0' }}><strong>{stale} {stale === 1 ? 'was' : 'were'} approved more than 24 hours ago.</strong> Check {stale === 1 ? 'it' : 'them'} again before sending.</p> : null}
      </Modal>
    </div>
  );
}
