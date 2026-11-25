'use client';
// The Search button of the top bar and the palette it opens (Ctrl+K or Cmd+K from any back-office page).
// The palette is a dialog with one input and a listbox. Focus stays in the input and the arrow keys move the chosen
// option (aria-activedescendant); Tab cycles between the input and Close. Esc closes and gives focus back.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addRecent, loadRecent, type Recent } from '@/lib/search/recent';
import { flatten, GO_TO, type SearchGroup, type SearchItem } from '@/lib/search/results';
import { MAX_QUERY } from '@/lib/search/schema';
import s from './search.module.css';

const DEBOUNCE_MS = 200;
type Status = 'idle' | 'loading' | 'done' | 'error';

function storage(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function SearchLauncher() {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [retry, setRetry] = useState(0);
  const returnTo = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const term = q.trim();

  const show = useCallback(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRecent(loadRecent(storage()));
    setQ(''); setGroups([]); setStatus('idle'); setActive(0);
    setOpen(true);
  }, []);
  const hide = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) setTimeout(() => returnTo.current?.focus?.(), 0);
  }, []);

  // Ctrl+K / Cmd+K anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) hide(true); else show();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, show, hide]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  // Search after a short pause; a newer search cancels the older request.
  useEffect(() => {
    if (!open) return;
    if (!term) { setGroups([]); setStatus('idle'); return; }
    setStatus('loading');
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { groups: SearchGroup[] };
        setGroups(body.groups ?? []);
        setStatus('done');
        setActive(0);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [term, open, retry]);

  const shown: SearchGroup[] = useMemo(() => {
    if (term) return status === 'done' ? groups : [];
    const rec: SearchItem[] = recent.map((r) => ({ key: `recent-${r.href}`, kind: r.href.startsWith('/sponsors') ? 'sponsor' : 'creator', title: r.title, meta: r.meta, href: r.href }));
    return [...(rec.length ? [{ label: 'Recently opened', items: rec }] : []), { label: 'Go to', items: GO_TO }];
  }, [term, status, groups, recent]);
  const flat = useMemo(() => flatten(shown), [shown]);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, flat]);

  function go(item: SearchItem | undefined) {
    if (!item) return;
    if (item.kind === 'creator' || item.kind === 'sponsor') addRecent(storage(), { href: item.href, title: item.title, meta: item.meta });
    hide(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(true); return; }
    if (e.key === 'Tab') {
      // Two stops only: the input and Close.
      e.preventDefault();
      (document.activeElement === inputRef.current ? closeRef.current : inputRef.current)?.focus();
      return;
    }
    if (document.activeElement !== inputRef.current) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = flat.length;
      if (n) setActive((activeIndex + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[activeIndex]);
    }
  }

  let n = 0;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const busy = !!term && status === 'loading';
  const count = flat.length;
  const announce = !term ? '' : status === 'loading' ? 'Searching' : status === 'error' ? 'Search failed' : count ? `${count} result${count === 1 ? '' : 's'}` : 'Nothing matches';

  return (
    <>
      <button type="button" className={s.btn} onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts="Control+K Meta+K">
        Search <kbd className={s.hint}>Ctrl K</kbd>
      </button>
      {open ? (
        <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) hide(true); }}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
            <div className={s.head}>
              <label className="sr-only" htmlFor={`${uid}-in`}>Search creators, sponsors and deals</label>
              <input
                id={`${uid}-in`} ref={inputRef} className={s.input} value={q} maxLength={MAX_QUERY} autoComplete="off" spellCheck={false}
                placeholder="Search creators, sponsors and deals" role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-autocomplete="list"
                aria-activedescendant={count ? optionId(activeIndex) : undefined}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
              />
              <button type="button" ref={closeRef} className={s.close} aria-label="Close search" onClick={() => hide(true)}>×</button>
            </div>
            <div className="sr-only" role="status" aria-live="polite">{announce}</div>
            <div className={s.list} ref={listRef} aria-busy={busy}>
              {term && status === 'error' ? (
                <p className={s.state} role="alert">Search is not working right now. <button type="button" onClick={() => setRetry((r) => r + 1)}>Try again</button></p>
              ) : term && status !== 'done' ? (
                <p className={s.state}>Searching…</p>
              ) : term && count === 0 ? (
                <p className={s.state}>Nothing matches “{term}”. Try a name, a channel or a sponsor.</p>
              ) : (
                <div id={`${uid}-list`} role="listbox" aria-label={term ? 'Search results' : 'Suggestions'}>
                  {shown.map((g) => (
                    <div key={g.label} role="group" aria-label={g.label}>
                      <div className={`${s.group} label`} aria-hidden="true">{g.label}</div>
                      {g.items.map((it) => {
                        const i = n++;
                        return (
                          <div
                            key={it.key} id={optionId(i)} role="option" aria-selected={i === activeIndex} className={s.item}
                            onMouseDown={(e) => e.preventDefault()} onMouseMove={() => { if (i !== activeIndex) setActive(i); }} onClick={() => go(it)}
                          >
                            <span className={s.title}>{it.title}</span>
                            {it.meta ? <span className={s.meta}>{it.meta}</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={s.foot} aria-hidden="true">
              <span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
