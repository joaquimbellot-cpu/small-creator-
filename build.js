#!/usr/bin/env node
'use strict';

/*
 * build.js: turns src/ into the finished Smallfold website.
 *
 *   node build.js                 build into site/
 *   node build.js --out <dir>     build into another folder
 *   node build.js --strict        exit with code 1 if a template asks for a key that does not exist
 *   node build.js --serve [port]  build, serve at http://localhost:8000/ and rebuild when src/ changes
 *   node build.js --self-test     test the template engine
 *
 * No dependencies. Needs Node 18 or newer.
 * The template syntax is described in README.md.
 *
 * Contents of this file:
 *   1. Configuration
 *   2. Template engine
 *   3. Build
 *   4. Local server and file watching
 *   5. Self-test
 *   6. Command line
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DEFAULT_OUT = path.join(ROOT, 'site');

/* ------------------------------------------------------------------ *
 * 1. Configuration
 * ------------------------------------------------------------------ */

// Page file -> page id. The id picks the title and description from
// src/content/seo.json and sets page.is.<id> to true on that page.
const PAGES = {
  'index.html': 'home',
  'how-it-works.html': 'how',
  'brands.html': 'brands',
  'about.html': 'about',
  'questions.html': 'questions',
  'contact.html': 'contact',
  'apply.html': 'apply',
  'privacy.html': 'privacy',
  'terms.html': 'terms',
  'styleguide.html': 'styleguide',
};

// The stylesheets and scripts are joined in exactly this order.
const CSS_ORDER = ['tokens', 'base', 'components', 'header', 'footer', 'hero', 'sections', 'motion'];
const JS_ORDER = ['nav', 'hero', 'forms', 'motion'];

// Names the build adds to the template data itself; a content file may not use them.
const RESERVED_NAMES = ['page', 'body'];

/* ------------------------------------------------------------------ *
 * 2. Template engine
 *
 *   {{a.b}}  {{{a.b}}}  {{> partial}}
 *   {{#each list}} ... {{/each}}      with {{this}} {{@index}} {{@number}} {{@first}} {{@last}}
 *   {{#if key}} ... {{else}} ... {{/if}}
 *   {{#unless key}} ... {{else}} ... {{/unless}}
 * ------------------------------------------------------------------ */

const TAG = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^{}]+?)\s*\}\}/g;
const KEY = /^(?:@(?:index|number|first|last)|[A-Za-z_][\w-]*(?:\.[\w-]+)*)$/;
const PARTIAL_NAME = /^[\w-]+(?:\/[\w-]+)*$/;
const BLOCKS = ['each', 'if', 'unless'];
const MAX_PARTIAL_DEPTH = 20;

const parseCache = new Map();

// Turns template text into a tree of nodes:
//   { type: 'text', value }
//   { type: 'value', key, raw }
//   { type: 'partial', name }
//   { type: 'each' | 'if' | 'unless', key, children, otherwise }
function parseTemplate(source, file) {
  const cacheKey = file + '\n' + source;
  if (parseCache.has(cacheKey)) return parseCache.get(cacheKey);

  const fail = (message, index) => {
    const line = source.slice(0, index).split('\n').length;
    throw new Error(`${file}, line ${line}: ${message}`);
  };

  const root = [];
  const open = []; // blocks that are not closed yet: { node, index, inElse }
  let target = root; // the list that receives the next node
  let pos = 0;
  let match;
  const tag = new RegExp(TAG.source, 'g');

  while ((match = tag.exec(source))) {
    const raw = match[1] !== undefined;
    const expr = raw ? match[1] : match[2];
    const at = match.index;
    let start = at;
    let end = tag.lastIndex;

    // A block tag that stands alone on its line leaves no empty line behind.
    if (!raw && /^(?:[#/]|else$)/.test(expr)) {
      const lineStart = source.lastIndexOf('\n', start - 1) + 1;
      const newline = source.indexOf('\n', end);
      const lineEnd = newline === -1 ? source.length : newline + 1;
      const alone =
        lineStart >= pos &&
        source.slice(lineStart, start).trim() === '' &&
        source.slice(end, lineEnd).trim() === '';
      if (alone) {
        start = lineStart;
        end = lineEnd;
      }
    }

    if (start > pos) target.push({ type: 'text', value: source.slice(pos, start) });
    pos = end;
    tag.lastIndex = end;

    if (raw) {
      if (!KEY.test(expr)) fail(`cannot read {{{${expr}}}}`, at);
      target.push({ type: 'value', key: expr, raw: true });
    } else if (expr[0] === '>') {
      const name = expr.slice(1).trim();
      if (!PARTIAL_NAME.test(name)) fail(`cannot read {{${expr}}}`, at);
      target.push({ type: 'partial', name });
    } else if (expr[0] === '#') {
      const [kind, key, ...rest] = expr.slice(1).trim().split(/\s+/);
      if (!BLOCKS.includes(kind)) fail(`unknown block {{#${kind}}}`, at);
      if (!key || rest.length || !KEY.test(key)) fail(`{{#${kind}}} needs exactly one key`, at);
      const node = { type: kind, key, children: [], otherwise: [] };
      target.push(node);
      open.push({ node, index: at, inElse: false });
      target = node.children;
    } else if (expr === 'else') {
      const top = open[open.length - 1];
      if (!top || top.node.type === 'each' || top.inElse) {
        fail('{{else}} belongs inside {{#if}} or {{#unless}}, once', at);
      }
      top.inElse = true;
      target = top.node.otherwise;
    } else if (expr[0] === '/') {
      const kind = expr.slice(1).trim();
      const top = open.pop();
      if (!top) fail(`{{/${kind}}} has no opening tag`, at);
      if (top.node.type !== kind) fail(`{{/${kind}}} found, but {{#${top.node.type}}} is still open`, at);
      const parent = open[open.length - 1];
      target = !parent ? root : parent.inElse ? parent.node.otherwise : parent.node.children;
    } else {
      if (!KEY.test(expr)) fail(`cannot read {{${expr}}}`, at);
      target.push({ type: 'value', key: expr, raw: false });
    }
  }

  if (open.length) {
    const top = open[open.length - 1];
    fail(`{{#${top.node.type} ${top.node.key}}} is never closed`, top.index);
  }
  if (pos < source.length) root.push({ type: 'text', value: source.slice(pos) });

  parseCache.set(cacheKey, root);
  return root;
}

// Renders template text with data.
// env = { partial(name) -> { source, file } or null, missing: Map }
function renderTemplate(source, file, data, env) {
  return renderNodes(parseTemplate(source, file), [{ item: data }], file, env, 0);
}

// scopes is a stack: the page data first, then one entry per open {{#each}}.
function renderNodes(nodes, scopes, file, env, depth) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.value;
    } else if (node.type === 'value') {
      const value = lookup(node.key, scopes);
      if (value === undefined || value === null) {
        out += reportMissing(env, node.key, file, '');
      } else if (typeof value === 'object') {
        out += reportMissing(env, node.key, file, 'it is a list or a group, not text');
      } else {
        out += node.raw ? String(value) : escapeHtml(String(value));
      }
    } else if (node.type === 'partial') {
      const partial = env.partial(node.name);
      if (!partial) {
        out += reportMissing(env, '> ' + node.name, file, '');
      } else if (depth >= MAX_PARTIAL_DEPTH) {
        throw new Error(`${file}: the partial "${node.name}" includes itself`);
      } else {
        const partialNodes = parseTemplate(partial.source, partial.file);
        out += renderNodes(partialNodes, scopes, partial.file, env, depth + 1);
      }
    } else if (node.type === 'each') {
      const list = lookup(node.key, scopes);
      if (!Array.isArray(list)) {
        out += reportMissing(env, node.key, file, list === undefined ? '' : 'it is not a list');
        continue;
      }
      list.forEach((item, i) => {
        const meta = { index: i, number: i + 1, first: i === 0, last: i === list.length - 1 };
        out += renderNodes(node.children, scopes.concat({ item, meta }), file, env, depth);
      });
    } else {
      // 'if' and 'unless'. A key that does not exist simply counts as false here.
      const truthy = isTruthy(lookup(node.key, scopes));
      const show = node.type === 'if' ? truthy : !truthy;
      out += renderNodes(show ? node.children : node.otherwise, scopes, file, env, depth);
    }
  }
  return out;
}

// Finds the value for a key: the current {{#each}} item first, then the outer scopes.
function lookup(key, scopes) {
  if (key[0] === '@') {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].meta) return scopes[i].meta[key.slice(1)];
    }
    return undefined;
  }
  if (key === 'this') return scopes[scopes.length - 1].item;
  const parts = (key.startsWith('this.') ? key.slice(5) : key).split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const value = walk(scopes[i].item, parts);
    if (value !== undefined) return value;
  }
  return undefined;
}

// Follows a.b.c through nested objects (own keys only).
function walk(value, parts) {
  for (const part of parts) {
    if (value === null || typeof value !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

// Empty string, empty list, false, null and undefined count as "no".
function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !(value === '' || value === false || value === null || value === undefined);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Remembers the problem for the end of the build and returns a visible marker for the page.
function reportMissing(env, key, file, why) {
  const id = key + '|' + file;
  if (!env.missing.has(id)) env.missing.set(id, { key, file, why });
  return `⟦${escapeHtml(key)}⟧`;
}

/* ------------------------------------------------------------------ *
 * 3. Build
 * ------------------------------------------------------------------ */

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => entry.name)
    .sort();
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

const isInside = (dir, parent) => {
  const relative = path.relative(parent, dir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

// The out folder is emptied on every build, so make sure it is a safe one.
function prepareOutDir(outDir) {
  const protectedDirs = [SRC, path.join(ROOT, 'docs'), path.join(ROOT, '.git')];
  if (isInside(ROOT, outDir) || protectedDirs.some((dir) => isInside(outDir, dir))) {
    throw new Error(`refusing to build into ${outDir}: that would delete project files`);
  }
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir);
    const looksLikeOurBuild =
      fs.existsSync(path.join(outDir, 'index.html')) &&
      fs.existsSync(path.join(outDir, 'assets', 'site.css'));
    if (entries.length && !looksLikeOurBuild) {
      throw new Error(`refusing to empty ${outDir}: it holds files that are not an earlier build`);
    }
    for (const name of entries) fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
}

// Every src/content/<name>.json becomes the top-level template key <name>.
function loadContent() {
  const dir = path.join(SRC, 'content');
  const content = {};
  for (const fileName of listFiles(dir, '.json')) {
    const name = path.basename(fileName, '.json');
    if (RESERVED_NAMES.includes(name)) {
      throw new Error(`src/content/${fileName}: the name "${name}" is used by the build itself`);
    }
    try {
      content[name] = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8'));
    } catch (err) {
      throw new Error(`src/content/${fileName} is not valid JSON: ${err.message}`);
    }
  }
  return content;
}

// Reads src/partials/<name>.html, or .svg for icons. Each file is read once per build.
function createPartialLoader() {
  const cache = new Map();
  return (name) => {
    if (!cache.has(name)) {
      let found = null;
      for (const ext of ['.html', '.svg']) {
        const file = path.join(SRC, 'partials', name + ext);
        if (fs.existsSync(file)) {
          found = { source: fs.readFileSync(file, 'utf8').trimEnd(), file: rel(file) };
          break;
        }
      }
      cache.set(name, found);
    }
    return cache.get(name);
  };
}

// Joins the files of src/css or src/js in the fixed order, with a banner before each.
function bundle(folder, order, ext, warnings) {
  const dir = path.join(SRC, folder);
  const known = order.map((name) => name + ext);
  for (const fileName of listFiles(dir, ext)) {
    if (!known.includes(fileName)) warnings.push(`src/${folder}/${fileName} is not in the build order and was left out`);
  }
  return order
    .map((name) => {
      const file = path.join(dir, name + ext);
      let text = '';
      if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8').trim();
      else warnings.push(`src/${folder}/${name}${ext} does not exist`);
      return `/* ===== src/${folder}/${name}${ext} ===== */\n${text}\n`;
    })
    .join('\n');
}

// Counts the "[slot: purpose]" texts that nobody has replaced yet.
function countPlaceholders(value) {
  if (typeof value === 'string') return /^\[[^\]]*\]$/.test(value.trim()) ? 1 : 0;
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, child) => sum + countPlaceholders(child), 0);
  }
  return 0;
}

// Builds the whole site. Returns { pages, missing, warnings, placeholders }.
// Everything is prepared in memory first, so a failed build leaves the last good site in place.
function buildSite(outDir) {
  const warnings = [];
  const env = { missing: new Map(), partial: createPartialLoader() };
  const content = loadContent();
  const seoPages = (content.seo && content.seo.pages) || {};

  // Pages: each body is rendered first, then placed in the layout as {{{body}}}.
  const layoutFile = path.join(SRC, 'partials', 'layout.html');
  const layout = fs.readFileSync(layoutFile, 'utf8');
  const pageFiles = listFiles(path.join(SRC, 'pages'), '.html');
  const output = new Map(); // path inside the out folder -> text

  for (const fileName of Object.keys(PAGES)) {
    if (!pageFiles.includes(fileName)) warnings.push(`src/pages/${fileName} is listed in PAGES but does not exist`);
  }

  let built = 0;
  for (const fileName of pageFiles) {
    let id = PAGES[fileName];
    // The style guide is a reference for whoever edits the site, not a page for visitors.
    if (id === 'styleguide' && !INCLUDE_STYLEGUIDE) continue;
    built++;
    if (!id) {
      id = path.basename(fileName, '.html');
      warnings.push(`src/pages/${fileName} is not listed in PAGES; using the id "${id}"`);
    }
    const seo = seoPages[id] || {};
    const page = {
      id,
      file: fileName,
      isHome: id === 'home',
      title: seo.title,
      description: seo.description,
      is: {},
    };
    for (const otherId of Object.values(PAGES)) page.is[otherId] = otherId === id;
    page.is[id] = true;

    // A fresh copy of the content for every page, so nothing leaks between pages.
    const data = Object.assign(structuredClone(content), { page });

    // Each nav item learns whether it points to this page: {{#if current}}.
    if (data.site && Array.isArray(data.site.nav)) {
      for (const item of data.site.nav) {
        if (item && typeof item === 'object') item.current = item.id === id;
      }
    }

    const pageFile = path.join(SRC, 'pages', fileName);
    data.body = renderTemplate(fs.readFileSync(pageFile, 'utf8'), rel(pageFile), data, env);
    const html = renderTemplate(layout, rel(layoutFile), data, env);
    output.set(fileName, html.trimEnd() + '\n');
  }

  // One stylesheet and one script.
  // The stylesheet's comments stay in src/css for whoever edits it; visitors do not download them.
  const css = bundle('css', CSS_ORDER, '.css', warnings)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n');
  output.set('assets/site.css', css.trimStart());
  output.set('assets/site.js', bundle('js', JS_ORDER, '.js', warnings));

  // Write: empty the out folder, copy the files that stay as they are, then the built files.
  prepareOutDir(outDir);
  copyDir(path.join(SRC, 'static'), outDir);
  copyDir(path.join(SRC, 'assets'), path.join(outDir, 'assets'));
  for (const [file, text] of output) fs.writeFileSync(path.join(outDir, file), text);

  // Sitemap: only once the site's address is known (seo.json, "siteUrl"). It lists every page
  // except the style guide, and robots.txt then points search engines to it.
  const siteUrl = String((content.seo && content.seo.siteUrl) || '').trim();
  if (siteUrl) {
    const base = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';
    const urls = pageFiles
      .filter((fileName) => PAGES[fileName] && PAGES[fileName] !== 'styleguide')
      .map((fileName) => `  <url><loc>${base}${fileName === 'index.html' ? '' : fileName}</loc></url>`);
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
    fs.appendFileSync(path.join(outDir, 'robots.txt'), `\nSitemap: ${base}sitemap.xml\n`);
  }

  return {
    pages: built,
    missing: [...env.missing.values()],
    warnings,
    placeholders: countPlaceholders(content),
  };
}

// Runs a build and prints the result. Returns true when the build is good.
function runBuild(outDir, strict) {
  const started = Date.now();
  let result;
  try {
    result = buildSite(outDir);
  } catch (err) {
    console.error(`BUILD FAILED: ${err.message}`);
    return false;
  }

  const shownOut = isInside(outDir, ROOT) ? rel(outDir) + '/' : outDir;
  console.log(`Built ${result.pages} pages into ${shownOut} in ${Date.now() - started} ms`);
  for (const warning of result.warnings) console.log(`WARNING ${warning}`);
  if (result.placeholders) {
    console.log(`Note: ${result.placeholders} placeholder texts in [brackets] are still in src/content/`);
  }
  for (const { key, file, why } of result.missing) {
    console.log(`MISSING {{${key}}} in ${file}${why ? ` (${why})` : ''}`);
  }
  if (result.missing.length) {
    console.log(`${result.missing.length} missing. Each one shows on the page as ⟦key⟧.`);
    if (strict) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 4. Local server and file watching (--serve)
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
};

function serve(outDir, port) {
  const server = http.createServer((req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };

    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (err) {
      return send(400, 'text/plain; charset=utf-8', 'Bad request');
    }
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    // Never serve anything outside the out folder.
    const file = path.join(outDir, urlPath);
    if (!isInside(file, outDir)) return send(403, 'text/plain; charset=utf-8', 'Forbidden');

    fs.readFile(file, (err, body) => {
      if (err) return send(404, 'text/plain; charset=utf-8', `Not found: ${urlPath}`);
      send(200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', body);
    });
  });

  server.on('error', (err) => {
    console.error(`Cannot serve on port ${port}: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`Serving at http://localhost:${port}/  (press Ctrl+C to stop)`);
  });
}

// Calls onChange shortly after anything under dir changes.
function watch(dir, onChange) {
  let timer = null;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };
  try {
    fs.watch(dir, { recursive: true }, changed);
  } catch (err) {
    // Node 18 on Linux cannot watch recursively: watch every folder instead.
    // (Folders created later are only seen after a restart.)
    const watchFolder = (folder) => {
      fs.watch(folder, changed);
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.isDirectory()) watchFolder(path.join(folder, entry.name));
      }
    };
    watchFolder(dir);
  }
}

/* ------------------------------------------------------------------ *
 * 5. Self-test (--self-test)
 * ------------------------------------------------------------------ */

function selfTest() {
  const partials = {
    inner: '<b>{{name}}</b>',
    outer: '({{> inner}})',
    'icons/dot': '<svg class="icon"></svg>',
  };
  const data = {
    name: 'Outer',
    html: '<em>"A" & B</em>',
    site: { brand: { name: 'Smallfold' } },
    yes: true,
    no: false,
    empty: '',
    none: [],
    nothing: null,
    words: ['a', 'b', 'c'],
    groups: [
      { title: 'G1', links: [{ label: 'x' }, { label: 'y' }] },
      { title: 'G2', name: 'Inner', links: [{ label: 'z' }] },
    ],
  };

  // [name, template, expected output (text or pattern), expected missing keys]
  const cases = [
    ['escaped value', '{{html}}', '&lt;em&gt;&quot;A&quot; &amp; B&lt;/em&gt;'],
    ['raw value', '{{{html}}}', '<em>"A" & B</em>'],
    ['dotted path', '{{site.brand.name}} {{ site.brand.name }}', 'Smallfold Smallfold'],
    ['each with this', '{{#each words}}{{this}}{{/each}}', 'abc'],
    ['each with this.key', '{{#each groups}}{{this.title}}{{/each}}', 'G1G2'],
    ['@index and @number', '{{#each words}}{{@index}}{{@number}} {{/each}}', '01 12 23 '],
    [
      '@first and @last',
      '{{#each words}}{{#if @first}}[{{/if}}{{this}}{{#unless @last}},{{/unless}}{{#if @last}}]{{/if}}{{/each}}',
      '[a,b,c]',
    ],
    [
      'nested each',
      '{{#each groups}}{{title}}:{{#each links}}{{label}}{{@index}}{{/each}};{{/each}}',
      'G1:x0y1;G2:z0;',
    ],
    [
      'scope fallback',
      '{{#each groups}}{{#each links}}{{label}}-{{title}}-{{name}} {{/each}}{{/each}}',
      'x-G1-Outer y-G1-Outer z-G2-Inner ',
    ],
    ['if / else', '{{#if yes}}Y{{else}}N{{/if}}{{#if no}}Y{{else}}N{{/if}}', 'YN'],
    [
      'falsy values',
      '{{#if empty}}1{{/if}}{{#if none}}2{{/if}}{{#if nothing}}3{{/if}}{{#if no.such.key}}4{{/if}}{{#if words}}5{{/if}}',
      '5',
    ],
    ['unless / else', '{{#unless no}}A{{/unless}}{{#unless yes}}B{{else}}C{{/unless}}', 'AC'],
    ['if inside each inside if', '{{#if yes}}{{#each words}}{{#if @first}}1{{else}}0{{/if}}{{/each}}{{else}}no{{/if}}', '100'],
    ['partial in partial', '{{> outer}}', '(<b>Outer</b>)'],
    ['partial sees the each item', '{{#each groups}}{{> outer}}{{/each}}', '(<b>Outer</b>)(<b>Inner</b>)'],
    ['icon partial', '<a>{{> icons/dot}}</a>', '<a><svg class="icon"></svg></a>'],
    ['missing key', 'a{{nope.deep}}b', 'a⟦nope.deep⟧b', ['nope.deep']],
    ['missing key inside each', '{{#each words}}{{label}}{{/each}}', '⟦label⟧⟦label⟧⟦label⟧', ['label']],
    ['missing list', '{{#each nope}}x{{/each}}', '⟦nope⟧', ['nope']],
    ['missing partial', '{{> ghost}}', '⟦&gt; ghost⟧', ['> ghost']],
    ['a group is not text', '{{site.brand}}', '⟦site.brand⟧', ['site.brand']],
    [
      'block tags leave no empty lines',
      '<ul>\n  {{#each words}}\n  <li>{{this}}</li>\n  {{/each}}\n</ul>',
      '<ul>\n  <li>a</li>\n  <li>b</li>\n  <li>c</li>\n</ul>',
    ],
    ['unclosed block is an error', '{{#if yes}}x', /^ERROR: test, line 1: .*never closed/],
    ['wrong closing tag is an error', '{{#if yes}}x{{/each}}', /^ERROR: test, line 1: /],
  ];

  let failed = 0;
  for (const [name, template, expected, expectedMissing = []] of cases) {
    const env = {
      missing: new Map(),
      partial: (partialName) =>
        partialName in partials ? { source: partials[partialName], file: `partials/${partialName}` } : null,
    };
    let actual;
    try {
      actual = renderTemplate(template, 'test', data, env);
    } catch (err) {
      actual = `ERROR: ${err.message}`;
    }
    const missing = [...env.missing.values()].map((entry) => entry.key);
    const outputOk = expected instanceof RegExp ? expected.test(actual) : actual === expected;
    const missingOk = JSON.stringify(missing) === JSON.stringify(expectedMissing);

    if (outputOk && missingOk) {
      console.log(`PASS  ${name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${name}`);
      console.log(`      expected: ${JSON.stringify(String(expected))}  missing ${JSON.stringify(expectedMissing)}`);
      console.log(`      actual:   ${JSON.stringify(actual)}  missing ${JSON.stringify(missing)}`);
    }
  }
  console.log(failed ? `${failed} of ${cases.length} cases failed` : `All ${cases.length} cases passed`);
  return failed === 0;
}

/* ------------------------------------------------------------------ *
 * 6. Command line
 * ------------------------------------------------------------------ */

const USAGE = `Usage: node build.js [--out <dir>] [--strict] [--serve [port]] [--styleguide] [--self-test]

  (no options)     build src/ into site/
  --out <dir>      build into another folder
  --strict         exit with code 1 if a template asks for a missing key
  --serve [port]   build, serve the site (default port 8000), rebuild on changes
  --styleguide     also build the style guide page (styleguide.html), a reference for editors
  --self-test      test the template engine`;

// Set by --styleguide: also build src/pages/styleguide.html.
let INCLUDE_STYLEGUIDE = false;

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT, strict: false, serve: false, port: 8000, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) {
      options.out = path.resolve(argv[++i]);
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--serve') {
      options.serve = true;
      if (/^\d+$/.test(argv[i + 1] || '')) options.port = Number(argv[++i]);
    } else if (arg === '--styleguide') {
      INCLUDE_STYLEGUIDE = true;
    } else if (arg === '--self-test') {
      options.selfTest = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}\n\n${USAGE}`);
      process.exit(2);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.selfTest) {
    process.exit(selfTest() ? 0 : 1);
  }

  const ok = runBuild(options.out, options.strict);

  if (options.serve) {
    // Keep serving even when a build fails, so a typo can be fixed and saved again.
    serve(options.out, options.port);
    watch(SRC, () => {
      console.log(`\n${new Date().toLocaleTimeString()}  change in src/, rebuilding`);
      runBuild(options.out, options.strict);
    });
  } else if (!ok) {
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { renderTemplate, parseTemplate, buildSite, PAGES, CSS_ORDER, JS_ORDER };
