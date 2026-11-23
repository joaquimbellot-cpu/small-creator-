import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseChannelUrl, channelKey, normalizeChannelUrl } from './channel';
import { refreshSubscribers } from './index';

// index.ts imports 'server-only', which throws outside the Next.js server build.
vi.mock('server-only', () => ({}));

const UC1 = 'UC' + 'a'.repeat(22);
const UC2 = 'UC' + 'b'.repeat(22);
const UC3 = 'UC' + 'c'.repeat(22);

describe('parseChannelUrl', () => {
  it('reads handles, ids, /c/ and /user/', () => {
    expect(parseChannelUrl('https://www.youtube.com/@MayaBrooks')).toEqual({ kind: 'handle', value: 'MayaBrooks' });
    expect(parseChannelUrl('youtube.com/@maya/videos')).toEqual({ kind: 'handle', value: 'maya' });
    expect(parseChannelUrl(`https://youtube.com/channel/${UC1}`)).toEqual({ kind: 'id', value: UC1 });
    expect(parseChannelUrl('https://m.youtube.com/c/SomeName')).toEqual({ kind: 'custom', value: 'SomeName' });
    expect(parseChannelUrl('https://www.youtube.com/user/old')).toEqual({ kind: 'user', value: 'old' });
  });
  it('rejects everything else', () => {
    for (const u of ['', 'https://evil.com/@x', 'https://www.youtube.com/watch?v=abc', 'https://www.youtube.com/channel/short', 'javascript:alert(1)', 'https://youtube.com.evil.com/@x', 'https://www.youtube.com/']) {
      expect(parseChannelUrl(u)).toBeNull();
    }
  });
  it('gives the same key for the same channel', () => {
    expect(channelKey('https://youtube.com/@Maya')).toBe(channelKey('www.youtube.com/@maya/about'));
  });
});

describe('normalizeChannelUrl', () => {
  it('always stores https', () => {
    expect(normalizeChannelUrl('http://youtube.com/@name')).toBe('https://youtube.com/@name');
    expect(normalizeChannelUrl(' HTTP://WWW.YouTube.com/@name ')).toBe('https://WWW.YouTube.com/@name');
    expect(normalizeChannelUrl('https://youtube.com/@name')).toBe('https://youtube.com/@name');
    expect(normalizeChannelUrl('youtube.com/@name')).toBe('https://youtube.com/@name');
  });
  it('matches the database rule for every accepted spelling', () => {
    const db = /^https:\/\/((www|m)\.)?youtube\.com\//i;
    for (const v of ['http://m.youtube.com/@a', 'HTTPS://YOUTUBE.COM/@a', 'www.youtube.com/channel/UCabcdefghijklmnopqrstuv']) {
      expect(parseChannelUrl(v)).not.toBeNull();
      expect(normalizeChannelUrl(v)).toMatch(db);
    }
  });
});

describe('refreshSubscribers against a mock YouTube', () => {
  let server: Server;
  let base = '';
  const calls: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      const u = new URL(req.url!, 'http://x');
      calls.push(u.pathname + '?' + [...u.searchParams.keys()].filter((k) => k !== 'key').join(','));
      res.setHeader('Content-Type', 'application/json');
      if (u.searchParams.get('key') !== 'test-key') { res.statusCode = 403; res.end('{}'); return; }
      const id = u.searchParams.get('id');
      if (id) {
        const items = id.split(',').filter((x) => x !== UC3).map((x) => ({ id: x, statistics: x === UC2 ? { hiddenSubscriberCount: true } : { subscriberCount: '4200', hiddenSubscriberCount: false } }));
        res.end(JSON.stringify({ items })); return;
      }
      if (u.searchParams.get('forHandle') === '@good') { res.end(JSON.stringify({ items: [{ id: UC1, statistics: { subscriberCount: '777' } }] })); return; }
      res.end(JSON.stringify({}));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/youtube/v3`;
  });
  afterAll(() => { server.close(); });

  it('updates, hides, not found, resolves handles, reports unresolvable', async () => {
    const res = await refreshSubscribers({ apiKey: 'test-key', baseUrl: base }, [
      { id: 'a', channel_url: `https://youtube.com/channel/${UC1}`, youtube_channel_id: null },
      { id: 'b', channel_url: null, youtube_channel_id: UC2 },
      { id: 'c', channel_url: `https://youtube.com/channel/${UC3}`, youtube_channel_id: null },
      { id: 'd', channel_url: 'https://youtube.com/@good', youtube_channel_id: null },
      { id: 'e', channel_url: 'https://youtube.com/@missing', youtube_channel_id: null },
      { id: 'f', channel_url: 'https://youtube.com/c/Custom', youtube_channel_id: null },
      { id: 'g', channel_url: null, youtube_channel_id: null },
    ]);
    const by = Object.fromEntries(res.map((r) => [r.id, r]));
    expect(by.a).toMatchObject({ status: 'updated', subscribers: 4200, channelId: UC1 });
    expect(by.b).toMatchObject({ status: 'hidden', channelId: UC2 });
    expect(by.c.status).toBe('not_found');
    expect(by.d).toMatchObject({ status: 'updated', subscribers: 777, channelId: UC1 });
    expect(by.e.status).toBe('not_found');
    expect(by.f.status).toBe('error');
    expect(by.g.status).toBe('error');
    // ids a, b, c went in ONE call
    expect(calls.filter((c) => c.endsWith('part,maxResults,id')).length).toBe(1);
  });

  it('batches 50 ids per call and never leaks the key in errors', async () => {
    calls.length = 0;
    const many = Array.from({ length: 120 }, (_, i) => ({ id: String(i), channel_url: null, youtube_channel_id: 'UC' + String(i).padStart(22, 'x') }));
    const ok = await refreshSubscribers({ apiKey: 'test-key', baseUrl: base }, many);
    expect(ok.every((r) => r.status === 'updated')).toBe(true);
    expect(calls.length).toBe(3);
    const bad = await refreshSubscribers({ apiKey: 'SECRET-KEY-123', baseUrl: base }, [{ id: 'z', channel_url: null, youtube_channel_id: UC1 }]);
    expect(bad[0].status).toBe('error');
    expect(JSON.stringify(bad)).not.toContain('SECRET-KEY-123');
  });
});
