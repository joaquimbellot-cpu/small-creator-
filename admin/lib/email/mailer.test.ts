import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { assertOneRecipient, unsubscribeHeaders } from './mailer';

describe('assertOneRecipient', () => {
  it.each(['a@example.com', 'first.last+tag@sub.example.co.uk', "o'brien@example.org"])('accepts %s', (v) => {
    expect(() => assertOneRecipient(v)).not.toThrow();
  });
  it.each(['a@x.test, b@x.test', 'a@x.test;b@x.test', 'a@x.test b@x.test', 'Name <a@x.test>', '"a b"@x.test', 'a@x', 'a@@x.test', '', ' a@x.test', 'a@x.test\nbcc: b@x.test'])(
    'refuses %j',
    (v) => {
      expect(() => assertOneRecipient(v)).toThrow();
    },
  );
});

describe('unsubscribeHeaders', () => {
  it('points List-Unsubscribe at the one-click API address and asks for a one-click POST', () => {
    const h = unsubscribeHeaders('https://x.test/api/unsubscribe/abc', 'from@x.test');
    expect(h['List-Unsubscribe']).toContain('<https://x.test/api/unsubscribe/abc>');
    expect(h['List-Unsubscribe']).toContain('<mailto:from@x.test?subject=unsubscribe>');
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
