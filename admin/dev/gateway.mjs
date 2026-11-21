// Mimics the Supabase API gateway on http://localhost:54321
//   /auth/v1/*  -> GoTrue   (9999)      /rest/v1/* -> PostgREST (3001)
// Like Supabase, requests need an `apikey` header (the anon or service key), except the
// browser-facing auth links (verify, callback, authorize). CORS only for the app origins.
import http from 'node:http';
import { loadSecrets } from './keys.mjs';

const secrets = loadSecrets();
const validKeys = new Set([secrets.anon_key, secrets.service_key]);
const origins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
const open = /^\/auth\/v1\/(verify|callback|authorize|health|\.well-known\/)/;
const upstreams = { '/auth/v1': 9999, '/rest/v1': 3001 };

function cors(req, res) {
  const o = req.headers.origin;
  if (o && origins.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
}
const fail = (req, res, code, msg) => {
  cors(req, res);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: msg }));
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://gw');
  if (req.method === 'OPTIONS') {
    cors(req, res);
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || 'authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }
  if (url.pathname === '/health') return fail(req, res, 200, 'ok');

  const prefix = Object.keys(upstreams).find((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
  if (!prefix) return fail(req, res, 404, 'no route');

  const headers = { ...req.headers, host: `127.0.0.1:${upstreams[prefix]}` };
  const apikey = req.headers.apikey || url.searchParams.get('apikey');
  if (!open.test(url.pathname)) {
    if (!apikey) return fail(req, res, 401, 'No API key found in request');
    if (!validKeys.has(apikey)) return fail(req, res, 401, 'Invalid API key');
    if (!headers.authorization) headers.authorization = `Bearer ${apikey}`;
  }
  const path = url.pathname.slice(prefix.length) + url.search;
  const up = http.request({ host: '127.0.0.1', port: upstreams[prefix], path: path || '/', method: req.method, headers }, (ur) => {
    const out = Object.fromEntries(Object.entries(ur.headers).filter(([k]) => !k.startsWith('access-control-')));
    cors(req, res);
    for (const [k, v] of Object.entries(out)) res.setHeader(k, v);
    res.setHeader('Access-Control-Expose-Headers', 'content-range, content-profile, x-total-count');
    res.writeHead(ur.statusCode);
    ur.pipe(res);
  });
  up.on('error', () => fail(req, res, 502, 'upstream unavailable'));
  req.pipe(up);
}).listen(54321, '127.0.0.1', () => console.log('gateway on 54321'));
