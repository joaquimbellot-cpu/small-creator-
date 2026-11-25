'use client';
// The left filter rail. From 900px up it is a column; under 900px it is a drawer opened by FilterRailButton.
//
//   <div className="list-layout">
//     <FilterRail activeCount={chips.length} onClearAll={() => nav.clear(KEYS)} search={<SearchBox ... />}>
//       <FacetGroup ...>...</FacetGroup>
//     </FilterRail>
//     <div className="list-results">
//       <div className="list-tools"><FilterRailButton count={chips.length} /> ...</div>
//     </div>
//   </div>
//
// FilterRail and FilterRailButton share one open/closed state through a tiny store, so they can sit in different places
// of the page without a provider. One rail per page.
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from './Button';
import k from './kit.module.css';
import { inOtherDialog, lockBodyScroll, trapTab } from './overlayUtils';

const DRAWER_QUERY = '(max-width: 899px)';

let railOpen = false;
const listeners = new Set<() => void>();
function setRailOpen(v: boolean) {
  if (railOpen === v) return;
  railOpen = v;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
const getOpen = () => railOpen;
const getOpenServer = () => false;

function subscribeMq(l: () => void) {
  const mq = window.matchMedia(DRAWER_QUERY);
  mq.addEventListener('change', l);
  return () => mq.removeEventListener('change', l);
}
const getDrawer = () => window.matchMedia(DRAWER_QUERY).matches;

/** The "Filters (n)" button. Only visible under 900px. Put it in the list toolbar. */
export function FilterRailButton({ count = 0 }: { count?: number }) {
  return (
    <Button variant="ghost" size="sm" className={k.filterBtn} onClick={() => setRailOpen(true)} aria-haspopup="dialog">
      Filters{count ? ` (${count})` : ''}
    </Button>
  );
}

export function FilterRail({ activeCount, onClearAll, search, children, title = 'Filters' }: {
  /** Number of filters that are on. Shows "Clear all" when above 0. */
  activeCount: number;
  onClearAll: () => void;
  /** The search box, shown above the groups. */
  search?: ReactNode;
  /** FacetGroup elements. */
  children: ReactNode;
  title?: string;
}) {
  const open = useSyncExternalStore(subscribe, getOpen, getOpenServer);
  const drawer = useSyncExternalStore(subscribeMq, getDrawer, () => false);
  const ref = useRef<HTMLElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const isOpen = open && drawer;
  const close = useCallback(() => setRailOpen(false), []);

  // Drawer mode only: focus inside, trap Tab, Esc closes, page behind does not scroll, focus returns to the opener.
  useEffect(() => {
    if (!isOpen) return;
    const node = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    doneRef.current?.focus();
    const unlock = lockBodyScroll();
    function onKey(e: KeyboardEvent) {
      if (inOtherDialog(e, node)) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      trapTab(e, node);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      opener?.focus?.();
    };
  }, [isOpen, close]);

  // Back to a wide screen: forget the drawer state so it is closed next time the screen is narrow.
  useEffect(() => { if (!drawer && railOpen) setRailOpen(false); }, [drawer]);

  return (
    <>
      <div className={`${k.veil} ${isOpen ? k.veilOpen : ''}`} onMouseDown={close} aria-hidden="true" />
      <aside
        ref={ref}
        className={`${k.railBox} ${isOpen ? k.railOpen : ''}`}
        aria-label={title}
        {...(isOpen ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        <div className={k.rail}>
          <div className={k.railHead}>
            <h2 className={k.railTitle}>{title}</h2>
            <span className={k.railHeadActions}>
              {activeCount > 0 ? <button type="button" className={`${k.link} ${k.small}`} onClick={onClearAll}>Clear all</button> : null}
              <Button ref={doneRef} variant="ghost" size="sm" className={k.railDone} onClick={close}>Done</Button>
            </span>
          </div>
          {search ? <div className={k.railSearch}>{search}</div> : null}
          {children}
        </div>
      </aside>
    </>
  );
}
