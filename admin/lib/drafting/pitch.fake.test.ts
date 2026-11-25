// Runs draftPitch against the local fake Claude (dev/fake-anthropic.mjs, started here on its own port). Never the real API.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const PORT = 4017;
const LOG = path.join(os.tmpdir(), `fake-anthropic-pitch-${process.pid}.log`);
let proc: ChildProcess;

beforeAll(async () => {
  proc = spawn('node', [path.join(__dirname, '../../dev/fake-anthropic.mjs')], { env: { ...process.env, FAKE_ANTHROPIC_PORT: String(PORT), FAKE_ANTHROPIC_LOG: LOG }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${PORT}`;
  process.env.ANTHROPIC_API_KEY = 'local-fake-key';
  process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
  delete process.env.DRAFT_MODE;
});
afterAll(() => { proc?.kill(); fs.rmSync(LOG, { force: true }); });

const facts = (name = 'Lumen Audio', direction: 'to_creator' | 'to_sponsor' = 'to_creator') => ({
  direction,
  creator: { firstName: 'Maya', channelName: 'Maya Tech', channelUrl: 'https://youtube.com/@mayatech', niche: 'Tech', subscribers: 4200, avgViews: 1800 },
  sponsor: { name, industry: 'Audio gear', targetNiches: ['Tech'], targetMinSubs: 2000, targetMaxSubs: 20000 },
  pastSponsors: [{ name: 'Orbit Desk', month: 'Mar 2026' }],
  similarChannels: 3,
  contactFirstName: direction === 'to_sponsor' ? 'Dana' : null,
});

describe('draftPitch with the fake Claude', () => {
  it('returns a draft that passes the pitch checks, in both directions, and sends nothing personal', async () => {
    const { draftPitch } = await import('./pitch');
    for (const d of ['to_creator', 'to_sponsor'] as const) {
      const r = await draftPitch(facts('Lumen Audio', d), ['Orbit Desk', 'Lumen Audio']);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.draft.body).toContain(d === 'to_creator' ? 'Hi Maya,' : 'Hi Dana,');
    }
    const sent = fs.readFileSync(LOG, 'utf8');
    expect(sent).toContain('You write pitch emails for Smallfold');
    expect(sent).not.toMatch(/@example\.test|\+1 555/);
  });

  it('refuses an answer that names a company that is not in the facts', async () => {
    const { draftPitch } = await import('./pitch');
    const r = await draftPitch(facts('ZZ INVENT Co'), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('checks');
  });
});
