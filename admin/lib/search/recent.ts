// "Recently opened": names and links only, kept in the browser's sessionStorage (gone when the tab closes).
// Every read is checked again, because the storage is not trusted: only our own creator and sponsor links are accepted.
export const RECENT_KEY = 'smallfold.recent';
export const MAX_RECENT = 6;

export type Recent = { href: string; title: string; meta: string };
type Store = Pick<Storage, 'getItem' | 'setItem'>;

const HREF = /^\/(creators|sponsors)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanRecent(raw: unknown): Recent[] {
  if (!Array.isArray(raw)) return [];
  const out: Recent[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const { href, title, meta } = r as Record<string, unknown>;
    if (typeof href !== 'string' || !HREF.test(href) || typeof title !== 'string' || !title) continue;
    if (out.some((o) => o.href === href)) continue;
    out.push({ href, title: title.slice(0, 200), meta: typeof meta === 'string' ? meta.slice(0, 200) : '' });
    if (out.length === MAX_RECENT) break;
  }
  return out;
}

export function loadRecent(store: Store | null): Recent[] {
  try {
    return store ? cleanRecent(JSON.parse(store.getItem(RECENT_KEY) ?? '[]')) : [];
  } catch {
    return [];
  }
}

// Newest first, no duplicates. Returns the new list; a storage that refuses (private window) is ignored.
export function addRecent(store: Store | null, item: Recent): Recent[] {
  const next = cleanRecent([item, ...loadRecent(store)]);
  try {
    store?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the list just is not kept */
  }
  return next;
}
