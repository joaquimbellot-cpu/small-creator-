'use client';
import { useActionState } from 'react';
import { submitKeepingValues } from '@/lib/email/submit';
import { Button, Input, Notice, Textarea } from '@/components/ui';
import { saveTemplateAction, type TemplateState } from './actions';

type T = { id?: string; name: string; goal: string | null; subject: string; body: string };

export function TemplateForm({ template }: { template?: T }) {
  const [state, action, pending] = useActionState<TemplateState, FormData>(saveTemplateAction, {});
  return (
    <form onSubmit={submitKeepingValues(action)} style={{ maxWidth: 720 }}>
      {template?.id ? <input type="hidden" name="id" value={template.id} /> : null}
      <Input label="Name" name="name" defaultValue={template?.name} required maxLength={200} />
      <Input label="Goal (optional)" name="goal" defaultValue={template?.goal ?? ''} maxLength={2000} hint="What this email is for. Shown only to your team." />
      <Input label="Subject" name="subject" defaultValue={template?.subject} required maxLength={120} />
      <Textarea label="Body" name="body" defaultValue={template?.body} rows={12} required maxLength={4000}
        hint="Placeholders you can use: {{first_name}}  {{channel_name}}  {{niche}}  {{subscribers}}. The footer and opt-out link are added automatically." />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>Save template</Button>
    </form>
  );
}
