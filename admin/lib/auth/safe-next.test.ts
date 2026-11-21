import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each(['/%09/evil.com', '/\t/evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', '/%5Cevil.com', '/%2F/evil.com'])('rejects %s', (v) => {
    expect(safeNext(v)).toBe('/overview');
  });
  it('allows normal paths', () => {
    expect(safeNext('/creators?q=a')).toBe('/creators?q=a');
    expect(safeNext('/settings/audit?page=2&action=auth.login')).toBe('/settings/audit?page=2&action=auth.login');
  });
  it('falls back for non-strings', () => {
    expect(safeNext(undefined)).toBe('/overview');
  });
});
