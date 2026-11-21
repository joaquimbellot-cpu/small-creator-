// Mock drafting: no network call. Used when ANTHROPIC_API_KEY is missing or DRAFT_MODE=mock.
import type { CreatorFacts, Draft, Instruction } from './types';

export function fillPlaceholders(text: string, c: CreatorFacts): string {
  const values: Record<string, string> = {
    first_name: c.firstName,
    channel_name: c.channelName || 'your channel',
    niche: c.niche || 'your topic',
    subscribers: c.subscribers === null ? 'hidden' : c.subscribers.toLocaleString('en-US'),
  };
  // Unknown placeholders stay in the text, so validation rejects the draft.
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}

export function mockDraft(c: CreatorFacts, instruction: Instruction): Draft {
  if (instruction.kind === 'template') {
    return { subject: fillPlaceholders(instruction.subject, c), body: fillPlaceholders(instruction.body, c) };
  }
  const channel = c.channelName || 'your channel';
  return {
    subject: `A sponsor for ${channel}`,
    body: [
      `Hi ${c.firstName},`,
      '',
      `We found ${channel} and wanted to get in touch. Smallfold finds sponsors for small YouTube channels, and a person at Smallfold chooses each sponsor by hand.`,
      '',
      `${instruction.goal.trim()}`,
      '',
      'Joining is free, and you have the final say on every sponsor we suggest. If you would like to talk, just reply. We answer within 2 working days.',
    ].join('\n'),
  };
}
