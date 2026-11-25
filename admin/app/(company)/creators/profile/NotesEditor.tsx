'use client';
// Editable notes. Saved by a server action; the text never goes to the audit log.
import { useId, useState, useTransition } from 'react';
import { Button, Textarea, useToast } from '@/components/ui';
import { saveCreatorNotes } from './actions';
import s from './profile.module.css';

export function NotesEditor({ creatorId, initial }: { creatorId: string; initial: string }) {
  const toast = useToast();
  const id = useId();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function save() {
    setError('');
    start(async () => {
      const r = await saveCreatorNotes(creatorId, text);
      if (!r.ok) { setError(r.error); return; }
      setSaved(text);
      toast(r.message);
    });
  }
  return (
    <div className={s.notes}>
      <Textarea id={id} label="Notes" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything the team should know" error={error || undefined} />
      <div><Button variant="ghost" size="sm" onClick={save} loading={pending} disabled={text === saved}>Save notes</Button></div>
    </div>
  );
}
