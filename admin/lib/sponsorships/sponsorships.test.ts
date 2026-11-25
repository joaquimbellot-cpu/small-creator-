import { describe, expect, it } from 'vitest';
import { cleanVideoUrl, confirmSchema, isFutureDate, recordSchema } from './schemas';
import { plainError } from './errors';
import { sourceSentence, fmtDate } from './format';
import type { HistoryRecord } from './types';

const NOW = new Date('2026-11-25T10:00:00Z');
const ID = '78311874-3fca-35c2-ec6d-3228ef3b14ca';
const ok = { creatorId: ID, brandName: 'Acme', date: '2026-11-20' };

describe('cleanVideoUrl', () => {
  it.each(['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://m.youtube.com/watch?v=x'])('accepts %s', (u) => expect(cleanVideoUrl(u)).toBeTruthy());
  it.each(['http://youtube.com/watch?v=a', 'https://evil.example/youtube.com', 'https://youtube.com.evil.test/x', 'javascript:alert(1)', 'https://user:pw@youtube.com/x', 'not a link'])('refuses %s', (u) => expect(cleanVideoUrl(u)).toBeNull());
  it('treats empty as no link', () => expect(cleanVideoUrl('  ')).toBe(''));
});

describe('recordSchema', () => {
  const schema = recordSchema(NOW);
  it('accepts a minimal record', () => expect(schema.safeParse(ok).success).toBe(true));
  it('refuses a future date but allows today and one day of time-zone slack', () => {
    expect(schema.safeParse({ ...ok, date: '2026-11-25' }).success).toBe(true);
    expect(schema.safeParse({ ...ok, date: '2026-11-26' }).success).toBe(true);
    const r = schema.safeParse({ ...ok, date: '2026-11-27' });
    expect(!r.success && r.error.issues[0].message).toMatch(/future/);
    expect(isFutureDate('2027-01-01', NOW)).toBe(true);
  });
  it('refuses impossible and missing dates', () => {
    expect(schema.safeParse({ ...ok, date: '2026-02-31' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, date: '' }).success).toBe(false);
  });
  it('refuses a bad video link and too long text', () => {
    expect(schema.safeParse({ ...ok, videoUrl: 'http://youtu.be/x' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, videoTitle: 'x'.repeat(301) }).success).toBe(false);
    expect(schema.safeParse({ ...ok, note: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('refuses a bad creator id', () => expect(schema.safeParse({ ...ok, creatorId: 'nope' }).success).toBe(false));
});

describe('confirmSchema', () => {
  it('needs a note', () => {
    expect(confirmSchema.safeParse({ id: ID, note: '   ' }).success).toBe(false);
    expect(confirmSchema.safeParse({ id: ID, note: 'Watched it' }).success).toBe(true);
  });
});

describe('plainError', () => {
  it('translates database refusals', () => {
    expect(plainError({ code: '23505' })).toMatch(/already recorded/);
    expect(plainError({ code: '23514', message: 'a confirmed record cannot be rejected; ask the owner to delete it' })).toMatch(/cannot be rejected/);
    expect(plainError({ code: '42501' })).toMatch(/permission/);
    expect(plainError({ code: 'XX000', message: 'boom' })).toMatch(/Could not save/);
  });
});

describe('sourceSentence', () => {
  const base: HistoryRecord = {
    id: ID, creatorId: ID, creatorName: 'A', creatorChannel: null, creatorSubscribers: null, brandId: null, brandName: null, brandLinked: false,
    sponsoredOn: '2026-01-02', videoUrl: null, videoTitle: null, label: 'detected', origin: 'detected', detectionSignal: 'paid_flag',
    detectionConfidence: 'medium', evidenceNote: null, confirmedByName: null, confirmedAt: null, createdAt: '2026-10-07T00:00:00Z', rejected: false,
  };
  it('says nobody checked a detected record', () => expect(sourceSentence(base)).toBe('Found automatically on 7 Oct 2026: the paid-promotion flag. Confidence: medium. Nobody has checked it.'));
  it('names who confirmed', () => expect(sourceSentence({ ...base, label: 'confirmed', origin: 'manual', confirmedByName: 'Sam', confirmedAt: '2026-11-01T09:00:00Z', evidenceNote: 'Watched it' }))
    .toBe('Confirmed by Sam on 1 Nov 2026. Source: entered by the team. Watched it.'));
  it('formats a missing date', () => expect(fmtDate(null)).toBe('Date not known'));
});
