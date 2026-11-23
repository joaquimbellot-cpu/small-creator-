import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { pickIp } from './ip';

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
const local = { vercel: false, netlify: false };

describe('pickIp', () => {
  it('on Vercel reads only x-vercel-forwarded-for', () => {
    const host = { vercel: true, netlify: false };
    expect(pickIp(h({ 'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-real-ip': '9.9.9.9' }), host)).toBe('1.2.3.4');
    expect(pickIp(h({ 'x-real-ip': '9.9.9.9', 'x-nf-client-connection-ip': '8.8.8.8' }), host)).toBeNull();
  });
  it('on Netlify reads the edge header and never x-real-ip', () => {
    const host = { vercel: false, netlify: true };
    expect(pickIp(h({ 'x-nf-client-connection-ip': ' 2.2.2.2 ' }), host)).toBe('2.2.2.2');
    expect(pickIp(h({ 'x-real-ip': '9.9.9.9' }), host)).toBeNull();
  });
  it('elsewhere falls back to x-real-ip, then to the shared local bucket', () => {
    expect(pickIp(h({ 'x-real-ip': '10.0.0.5, 1.1.1.1' }), local)).toBe('10.0.0.5');
    expect(pickIp(h({}), local)).toBe('local');
  });
  it('never uses x-forwarded-for and cuts long values', () => {
    expect(pickIp(h({ 'x-forwarded-for': '6.6.6.6' }), local)).toBe('local');
    expect(pickIp(h({ 'x-real-ip': 'a'.repeat(300) }), local)).toHaveLength(100);
  });
});
