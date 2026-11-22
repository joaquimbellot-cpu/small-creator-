// SITE_PAGES must list every published website page, and none of them may share an address with the back office.
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SITE_PAGES } from './site-pages';

const require = createRequire(import.meta.url);
const { PAGES } = require('../../build.js') as { PAGES: Record<string, string> };

// Top-level back-office addresses: the folders in app/, looking inside route groups such as (company).
function appRoutes(): string[] {
  const dir = fileURLToPath(new URL('../app', import.meta.url));
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('(')) {
      for (const f of readdirSync(`${dir}/${e.name}`, { withFileTypes: true })) if (f.isDirectory()) out.push(f.name);
    } else out.push(e.name);
  }
  return out;
}

describe('SITE_PAGES', () => {
  it('matches the pages build.js publishes', () => {
    const published = Object.keys(PAGES)
      .filter((f) => PAGES[f] !== 'home' && PAGES[f] !== 'styleguide')
      .map((f) => f.replace(/\.html$/, ''));
    expect([...SITE_PAGES].sort()).toEqual(published.sort());
  });

  it('does not clash with a back-office address', () => {
    const routes = appRoutes();
    expect(routes).toContain('login');
    for (const p of SITE_PAGES) expect(routes).not.toContain(p);
  });
});
