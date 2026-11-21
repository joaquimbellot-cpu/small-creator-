'use client';
// Compose form: search and select creators, then a template or a goal. Submitting only drafts.
import { useActionState, useEffect, useState } from 'react';
import { Badge, Button, Input, Notice, Select, Textarea } from '@/components/ui';
import type { ComposeCreator } from '@/lib/email/creators';
import { draftAction, type ComposeState } from './actions';

const BLOCK_TEXT = { do_not_contact: 'Do not contact', suppressed: 'Opted out' } as const;

function CreatorLine({ c, action }: { c: ComposeCreator; action: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '6px 0' }}>
      <span>
        {c.full_name} <span className="muted">· {c.channel_name || c.email}</span>{' '}
        {c.blocked ? <Badge tone="bad">{BLOCK_TEXT[c.blocked]}</Badge> : null}
      </span>
      {action}
    </li>
  );
}

export function ComposeForm({ initial, templates, mock }: { initial: ComposeCreator[]; templates: { id: string; name: string }[]; mock: boolean }) {
  const [state, action, pending] = useActionState<ComposeState, FormData>(draftAction, {});
  const [selected, setSelected] = useState<ComposeCreator[]>(initial);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ComposeCreator[]>([]);
  const [mode, setMode] = useState<'template' | 'goal'>(templates.length ? 'template' : 'goal');

  // Search as the person types (after a short pause).
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/emails/creators?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults((await res.json()).creators);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const chosen = new Set(selected.map((c) => c.id));
  const usable = selected.filter((c) => !c.blocked);

  return (
    <form action={action} className="split">
      <div>
        <Input label="Find creators" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or channel" />
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Search results">
          {results.map((c) => (
            <CreatorLine
              key={c.id}
              c={c}
              action={
                <Button size="sm" variant="ghost" disabled={!!c.blocked || chosen.has(c.id)} onClick={() => setSelected([...selected, c])}>
                  {chosen.has(c.id) ? 'Added' : 'Add'}
                </Button>
              }
            />
          ))}
        </ul>
      </div>

      <div>
        <div className="label">Selected ({usable.length} of 25 max)</div>
        {selected.length === 0 ? <p className="muted">Nobody yet.</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }} aria-label="Selected creators">
          {selected.map((c) => (
            <CreatorLine key={c.id} c={c} action={<Button size="sm" variant="ghost" onClick={() => setSelected(selected.filter((s) => s.id !== c.id))}>Remove</Button>} />
          ))}
        </ul>
        {usable.map((c) => <input key={c.id} type="hidden" name="creators" value={c.id} />)}

        <Select label="Start from" name="mode" value={mode} onChange={(e) => setMode(e.target.value as 'template' | 'goal')}>
          <option value="template">A saved template</option>
          <option value="goal">A goal I type</option>
        </Select>
        {mode === 'template' ? (
          <Select label="Template" name="templateId" defaultValue="">
            <option value="" disabled>Choose a template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        ) : (
          <Textarea label="Goal, in one sentence" name="goal" rows={3} maxLength={500} placeholder="Introduce Smallfold and ask if they would like to hear about sponsors." />
        )}

        {mock ? <Notice tone="warn" title="Mock mode.">No Anthropic key is set, so drafts are filled in from the template or goal without Claude.</Notice> : null}
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Button type="submit" loading={pending} disabled={usable.length === 0 || usable.length > 25}>Draft emails</Button>
      </div>
    </form>
  );
}
