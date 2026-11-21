// Copies the public site's design tokens into app/tokens.css (generated, gitignored),
// so colours and type stay defined in one place: ../src/css/tokens.css.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../../src/css/tokens.css');
const to = resolve(here, '../app/tokens.css');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log('tokens.css copied');
