'use server';
import { unsubscribe, type UnsubscribeResult } from '@/lib/email/unsubscribe';

export type UnsubscribeState = { result?: UnsubscribeResult | 'error' };

// The token is a hidden field of the confirm form. Nothing happens until this action runs (a click).
export async function confirmUnsubscribeAction(_prev: UnsubscribeState, form: FormData): Promise<UnsubscribeState> {
  try {
    return { result: await unsubscribe(String(form.get('token') ?? '')) };
  } catch (e) {
    console.error('unsubscribe failed', e instanceof Error ? e.message : e);
    return { result: 'error' };
  }
}
