import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
const getCurrentStaff = vi.fn();
vi.mock('@/lib/auth/staff', () => ({ getCurrentStaff: () => getCurrentStaff() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));

import { ApiError, apiHandler } from './handler';

const owner = { id: 'o1', email: 'o@example.test', fullName: 'O', role: 'owner' };
const worker = { id: 'w1', email: 'w@example.test', fullName: 'W', role: 'worker' };

function req(init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new NextRequest('http://localhost:3000/api/x', { method: 'POST', ...init });
}
const json = { 'content-type': 'application/json' };

beforeEach(() => {
  getCurrentStaff.mockReset();
  getCurrentStaff.mockResolvedValue(worker);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('apiHandler', () => {
  const ok = apiHandler({}, () => ({ hello: 'world' }));

  it('answers 401 when nobody is logged in', async () => {
    getCurrentStaff.mockResolvedValue(null);
    expect((await ok(req())).status).toBe(401);
  });

  it('answers 403 for a write from another site (Origin)', async () => {
    const res = await ok(req({ headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });

  it('answers 403 for Sec-Fetch-Site cross-site, and allows same-origin', async () => {
    expect((await ok(req({ headers: { 'sec-fetch-site': 'cross-site' } }))).status).toBe(403);
    const res = await ok(req({ headers: { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('answers 403 for a worker on an owner route, and lets the owner in', async () => {
    const own = apiHandler({ role: 'owner' }, () => ({ ok: true }));
    expect((await own(req())).status).toBe(403);
    getCurrentStaff.mockResolvedValue(owner);
    expect((await own(req())).status).toBe(200);
  });

  it('answers 400 for a bad or unreadable body and passes a good one', async () => {
    const h = apiHandler({ body: z.object({ n: z.number() }) }, ({ body }) => ({ n: body.n }));
    expect((await h(req({ headers: json, body: '{"n":"x"}' }))).status).toBe(400);
    expect((await h(req({ headers: json, body: 'not json' }))).status).toBe(400);
    const res = await h(req({ headers: json, body: '{"n":3}' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 3 });
  });

  it('requires Content-Type application/json when a body is expected', async () => {
    const h = apiHandler({ body: z.object({ n: z.number() }) }, () => ({ ok: true }));
    expect((await h(req({ headers: { 'content-type': 'text/plain' }, body: '{"n":3}' }))).status).toBe(415);
    expect((await h(req({ body: '{"n":3}' }))).status).toBe(415);
    expect((await h(req({ headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"n":3}' }))).status).toBe(200);
  });

  it('does not require a content type when no body is expected (FormData uploads keep working)', async () => {
    expect((await ok(req({ headers: { 'content-type': 'multipart/form-data; boundary=x' } }))).status).toBe(200);
  });

  it('turns an ApiError into its status and anything else into a plain 500', async () => {
    const a = apiHandler({}, () => { throw new ApiError(409, 'Nope.'); });
    const r1 = await a(req());
    expect(r1.status).toBe(409);
    expect(await r1.json()).toEqual({ error: 'Nope.' });
    const b = apiHandler({}, () => { throw new Error('secret detail'); });
    const r2 = await b(req());
    expect(r2.status).toBe(500);
    expect(await r2.json()).toEqual({ error: 'Something went wrong.' });
  });
});
