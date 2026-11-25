'use client';
// Reads and changes the filters in the page address from a client component.
//   const nav = useListNav();
//   nav.get('q'); nav.getAll('niche'); nav.set('sponsored', 'yes'); nav.toggle('niche', 'tech'); nav.clear(['niche']);
// Rules: any change drops `page`; rapid changes (typing, dragging) become one router.replace after about 250 ms,
// inside a transition, so `isPending` is true while the server renders the new list. The values you read are
// the NEW ones straight away (optimistic), so controls never wait for the server.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { getList, toggleInList } from './query';

export type ListNav = {
  /** The address as the controls should show it (already includes changes still waiting to be sent). */
  params: URLSearchParams;
  get: (key: string) => string | null;
  /** Comma-separated value as an array. */
  getAll: (key: string) => string[];
  has: (key: string) => boolean;
  /** `null` or an empty string removes the key. */
  set: (key: string, value: string | null) => void;
  /** Add the value to the comma list, or remove it when present. */
  toggle: (key: string, value: string) => void;
  /** Several keys at once. `page` is removed unless you pass it yourself. */
  setMany: (values: Record<string, string | null | undefined>) => void;
  /** Remove these keys. */
  clear: (keys: string[]) => void;
  /** Replace the whole query string, for example with `removeChip(nav.params, chip, FILTERS)` or `clearFilters(nav.params, FILTERS)`. */
  replaceAll: (next: URLSearchParams) => void;
  /** True from the moment the address is sent until the server has answered. Show `SkeletonRows` or dim the list. */
  isPending: boolean;
};

const DELAY = 250;

export function useListNav(delay = DELAY): ListNav {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const server = sp.toString();
  const [isPending, startTransition] = useTransition();
  // `local` holds the address the user asked for while the server has not caught up. null = no change waiting.
  const [local, setLocal] = useState<string | null>(null);
  const latest = useRef(server); // the newest wanted address, so rapid calls build on each other
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // When the server address changes, or the transition ends and nothing new is waiting, follow the server again.
  useEffect(() => {
    if (timer.current) return;
    if (isPending) return;
    latest.current = server;
    setLocal(null);
  }, [server, isPending]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const send = useCallback(() => {
    timer.current = null;
    const qs = latest.current;
    startTransition(() => {
      router.replace(qs ? `${pathRef.current}?${qs}` : pathRef.current, { scroll: false });
    });
  }, [router]);

  const apply = useCallback((edit: (p: URLSearchParams) => void, keepPage = false) => {
    const p = new URLSearchParams(latest.current);
    edit(p);
    if (!keepPage) p.delete('page');
    const next = p.toString();
    if (next === latest.current) return;
    latest.current = next;
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(send, delay);
  }, [send, delay]);

  const current = local ?? server;
  const params = useMemo(() => new URLSearchParams(current), [current]);

  return useMemo<ListNav>(() => ({
    params,
    get: (key) => params.get(key),
    getAll: (key) => getList(params, key),
    has: (key) => (params.get(key) ?? '') !== '',
    set: (key, value) => apply((p) => { if (value == null || value === '') p.delete(key); else p.set(key, value); }),
    toggle: (key, value) => apply((p) => {
      const next = toggleInList(getList(p, key), value);
      if (next) p.set(key, next); else p.delete(key);
    }),
    setMany: (values) => apply((p) => {
      for (const [k, v] of Object.entries(values)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    }, 'page' in values),
    clear: (keys) => apply((p) => { for (const k of keys) p.delete(k); }),
    replaceAll: (next) => apply((p) => {
      Array.from(new Set(p.keys())).forEach((k) => p.delete(k));
      next.forEach((v, k) => p.append(k, v));
    }),
    isPending,
  }), [params, apply, isPending]);
}
