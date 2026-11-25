'use client';
// Right-hand drawer for a record (a creator, a sponsor). Veil, focus trap, Esc and veil click close it,
// focus goes back to what opened it, the page behind does not scroll.
//
//   <SidePanel
//     open={!!openId} onClose={() => nav.set('open', null)} label={creator.name}
//     position={{ index: 3, total: 25 }} onPrevious={...} onNext={...} fullPageHref={`/creators/${creator.id}`}
//   >
//     ...body (scrolls)...
//   </SidePanel>
//
// `position.index` starts at 1. Leave `position` out when the record is not in the current list.
// Change `scrollKey` (for example the record id) to scroll the body back to the top when the content changes.
import { useEffect, useRef, type ReactNode } from 'react';
import { Button, LinkButton } from './Button';
import k from './kit.module.css';
import { inOtherDialog, lockBodyScroll, trapTab } from './overlayUtils';

export function SidePanel({ open, onClose, label, children, position, onPrevious, onNext, fullPageHref, headerExtra, scrollKey }: {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog (the record name). */
  label: string;
  children: ReactNode;
  position?: { index: number; total: number };
  onPrevious?: () => void;
  onNext?: () => void;
  /** Adds an "Open full page" link in the header. */
  fullPageHref?: string;
  /** More buttons in the header, before "Open full page". */
  headerExtra?: ReactNode;
  scrollKey?: string | number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const unlock = lockBodyScroll();
    function onKey(e: KeyboardEvent) {
      if (inOtherDialog(e, node)) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      trapTab(e, node);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
      // The opener may have gone (a row that was re-rendered). Then focus stays where the browser puts it.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  // Previous/Next changes the record: scroll to the top, and keep focus in the panel if the pressed button became disabled.
  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo?.({ top: 0 });
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body || (a as HTMLButtonElement).disabled) closeBtn.current?.focus();
  }, [open, scrollKey, position?.index]);

  if (!open) return null;
  return (
    <>
      <div className={k.panelVeil} onMouseDown={onClose} aria-hidden="true" />
      <div ref={ref} className={k.panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className={k.panelHead}>
          <button ref={closeBtn} type="button" className={k.panelClose} onClick={onClose} aria-label="Close">×</button>
          <span className={k.panelGrow} />
          {position ? (
            <>
              <span className={k.panelCount}>{position.index} of {position.total}</span>
              <Button variant="ghost" size="sm" onClick={onPrevious} disabled={!onPrevious || position.index <= 1}>Previous</Button>
              <Button variant="ghost" size="sm" onClick={onNext} disabled={!onNext || position.index >= position.total}>Next</Button>
            </>
          ) : null}
          {headerExtra}
          {fullPageHref ? <LinkButton variant="ghost" size="sm" href={fullPageHref}>Open full page</LinkButton> : null}
        </div>
        <div ref={bodyRef} className={k.panelBody}>{children}</div>
      </div>
    </>
  );
}
