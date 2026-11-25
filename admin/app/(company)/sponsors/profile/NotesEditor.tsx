'use client';
// Editable notes of a sponsor.
import { useState, useTransition } from 'react';
import { Button, Notice, useToast } from '@/components/ui';
import { saveNotes } from '../actions';

export function NotesEditor({ id, initial }: { id: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <section className="panel-sec" aria-labelledby={`notes-${id}`}>
      <h3 id={`notes-${id}`}>Notes</h3>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <label className="sr-only" htmlFor={`notes-box-${id}`}>Notes</label>
      <textarea
        id={`notes-box-${id}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={5000} placeholder="Anything the team should know"
        style={{ width: '100%', padding: 'var(--s-3)', background: 'var(--surface)', color: 'var(--fg)', border: 'var(--hairline) solid var(--fg-muted)', borderRadius: 'var(--r)', font: 'inherit' }}
      />
      <div style={{ marginTop: 'var(--s-2)' }}>
        <Button
          variant="ghost" size="sm" loading={pending} disabled={text === saved}
          onClick={() => start(async () => {
            setError('');
            const r = await saveNotes(id, text);
            if (r.ok) { setSaved(text); toast('Notes saved.'); } else setError(r.error);
          })}
        >Save notes</Button>
      </div>
    </section>
  );
}
