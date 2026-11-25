'use client';
// Tags on the profile: shown as small labels, each with a remove button, and an "Add a tag" box (suggests existing tags).
import { useId, useState, useTransition } from 'react';
import { Tag, useToast } from '@/components/ui';
import { addCreatorTag, removeCreatorTag } from './actions';
import s from './profile.module.css';

export function TagEditor({ creatorId, tags, known }: { creatorId: string; tags: { id: string; name: string }[]; known: string[] }) {
  const toast = useToast();
  const listId = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [pending, start] = useTransition();

  function add() {
    const v = name.trim();
    if (!v) { setAdding(false); return; }
    start(async () => {
      const r = await addCreatorTag(creatorId, v);
      toast(r.ok ? r.message : r.error);
      if (r.ok) { setName(''); setAdding(false); }
    });
  }
  function remove(id: string, label: string) {
    start(async () => {
      const r = await removeCreatorTag(creatorId, id);
      toast(r.ok ? `Tag “${label}” removed.` : r.error);
    });
  }

  return (
    <span className={s.tags}>
      {tags.map((t) => (
        <span key={t.id} className={s.tagChip}>
          <Tag>{t.name}</Tag>
          <button type="button" className={s.tagX} aria-label={`Remove tag ${t.name}`} disabled={pending} onClick={() => remove(t.id, t.name)}>×</button>
        </span>
      ))}
      {adding ? (
        <span className={s.tagForm}>
          <label className="sr-only" htmlFor={`${listId}-in`}>New tag</label>
          <input id={`${listId}-in`} list={listId} value={name} maxLength={60} autoFocus placeholder="Tag name" autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') { setAdding(false); setName(''); } }} />
          <datalist id={listId}>{known.filter((k) => !tags.some((t) => t.name.toLowerCase() === k.toLowerCase())).map((k) => <option key={k} value={k} />)}</datalist>
          <button type="button" className="auth__linkbtn" onClick={add} disabled={pending}>Add</button>
          <button type="button" className="auth__linkbtn" onClick={() => { setAdding(false); setName(''); }}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="auth__linkbtn" onClick={() => setAdding(true)}>Add a tag</button>
      )}
    </span>
  );
}
