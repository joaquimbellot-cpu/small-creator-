import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-secret';
});

describe('unsubscribe token', () => {
  it('verifies a token it made', async () => {
    const { makeToken, verifyToken } = await import('./token');
    const id = '11111111-2222-3333-4444-555555555555';
    expect(verifyToken(makeToken(id))).toBe(id);
  });

  it('rejects tampered, swapped, malformed and foreign tokens', async () => {
    const { makeToken, verifyToken } = await import('./token');
    const a = makeToken('aaaa');
    const b = makeToken('bbbb');
    const [idA, sigA] = a.split('.');
    const [, sigB] = b.split('.');
    expect(verifyToken(`${idA}.${sigB}`)).toBeNull(); // id of one with the signature of another
    expect(verifyToken(`${Buffer.from('cccc').toString('base64url')}.${sigA}`)).toBeNull(); // changed id
    expect(verifyToken(`${idA}.${sigA.slice(0, -2)}`)).toBeNull(); // shortened signature
    expect(verifyToken(`${idA}.`)).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken(`${a}.extra`)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const { makeToken, verifyToken } = await import('./token');
    const token = makeToken('aaaa');
    process.env.UNSUBSCRIBE_SECRET = 'other';
    expect(verifyToken(token)).toBeNull();
    process.env.UNSUBSCRIBE_SECRET = 'test-secret';
  });
});

describe('footer', () => {
  it('always has the sender line and the unsubscribe link', async () => {
    const { buildFooter, buildText } = await import('./footer');
    const footer = buildFooter('PO Box 1, Somewhere', 'https://x.test/unsubscribe/abc');
    expect(footer).toContain('Smallfold, sponsors for small YouTube channels');
    expect(footer).toContain('PO Box 1, Somewhere');
    expect(footer).toContain("reply 'unsubscribe': https://x.test/unsubscribe/abc");
    expect(buildText('Hello', footer).endsWith(footer + '\n')).toBe(true);
  });

  it('keeps the footer even without a postal address', async () => {
    const { buildFooter } = await import('./footer');
    const footer = buildFooter(null, 'https://x.test/u');
    expect(footer).toContain('Smallfold, sponsors for small YouTube channels');
    expect(footer).toContain('https://x.test/u');
  });
});
