import { describe, expect, it } from 'vitest';
import { applicationSchema } from './schemas';

const base = { name: 'Test Person', email: 'test@example.test', channel: 'https://www.youtube.com/@testchannel', topic: 'Cooking', subscribers: '12,500' };

describe('applicationSchema', () => {
  it('accepts a normal application', () => {
    const r = applicationSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ channel: 'https://www.youtube.com/@testchannel', niche: 'Cooking', subscribers: 12500, notes: null, phone: null });
  });
  it('turns a bare @handle into a channel link', () => {
    const r = applicationSchema.safeParse({ ...base, channel: '@testchannel' });
    expect(r.success && r.data.channel).toBe('https://www.youtube.com/@testchannel');
  });
  it('keeps a long answer: short niche, full text in the notes', () => {
    const topic = 'I make long videos about slow cooking, bread and fermentation for beginners. '.repeat(4).trim();
    const r = applicationSchema.safeParse({ ...base, topic });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.niche!.length).toBeLessThanOrEqual(120);
      expect(r.data.notes).toContain(topic);
    }
  });
  it('keeps a phone with dots, written with spaces', () => {
    const r = applicationSchema.safeParse({ ...base, phone: '555.123.4567' });
    expect(r.success && r.data.phone).toBe('555 123 4567');
  });
  it('a YouTube link that is not a channel goes into the notes, never into the link column', () => {
    const r = applicationSchema.safeParse({ ...base, channel: 'https://www.youtube.com/watch?v=abc' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.channel).toBeNull();
      expect(r.data.notes).toContain('watch?v=abc');
    }
  });
  it('never stores a javascript: link', () => {
    const r = applicationSchema.safeParse({ ...base, channel: 'javascript:alert(1)' });
    expect(r.success && r.data.channel).toBeNull();
  });
  it('refuses a missing subscriber count and a bad email', () => {
    expect(applicationSchema.safeParse({ ...base, subscribers: 'lots' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
  });
});
