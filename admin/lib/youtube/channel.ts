// Turns a YouTube channel link into something we can look up.
//   parseChannelUrl('https://www.youtube.com/@mayabrooks') -> { kind: 'handle', value: 'mayabrooks' }
//   kinds: 'id' (/channel/UC...), 'handle' (/@name), 'custom' (/c/name), 'user' (/user/name); null = not a channel link.
// Pure functions (no server-only) so they run in the browser and in tests.
export type ChannelRef =
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'custom'; value: string }
  | { kind: 'user'; value: string };

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const NAME = /^[\p{L}\p{N}._\-·]{1,100}$/u;

/** Adds https:// when the link has no scheme. Returns null when it cannot be a URL. */
export function toUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw || raw.length > 500 || /\s/.test(raw)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u;
  } catch {
    return null;
  }
}

export function parseChannelUrl(input: string): ChannelRef | null {
  const u = toUrl(input);
  if (!u || !HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  const first = parts[0];
  if (!first) return null;
  if (first.startsWith('@')) {
    const handle = first.slice(1);
    return NAME.test(handle) ? { kind: 'handle', value: handle } : null;
  }
  const second = parts[1];
  if (!second) return null;
  if (first === 'channel') return CHANNEL_ID.test(second) ? { kind: 'id', value: second } : null;
  if (first === 'c' && NAME.test(second)) return { kind: 'custom', value: second };
  if (first === 'user' && NAME.test(second)) return { kind: 'user', value: second };
  return null;
}

/** The link as we store it: trimmed, always https:// (the database only accepts https YouTube links). */
export function normalizeChannelUrl(input: string): string {
  const raw = input.trim();
  if (/^http:\/\//i.test(raw)) return `https://${raw.slice(7)}`;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** A key that is the same for the same channel written in different ways (for duplicate checks). */
export function channelKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const ref = parseChannelUrl(input);
  if (!ref) return null;
  if (ref.kind === 'id') return `id:${ref.value}`;
  return `${ref.kind}:${ref.value.toLowerCase()}`;
}
