'use client';
// Accessible modal dialog: focus moves in, Tab stays inside, Esc and the backdrop close it, focus returns after.
//   <Modal open={bool} onClose={fn} title="Edit creator" footer={<Button/>...} wide?>{body}</Modal>
// Render it conditionally or with open=false; it renders nothing when closed.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import s from './ui.module.css';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node).focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); return; }
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === node)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`${s.modal} ${wide ? s.modalWide : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={s.modalHead}>
          <h2 className={s.modalTitle} id={titleId}>{title}</h2>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div>{children}</div>
        {footer ? <div className={s.modalFoot}>{footer}</div> : null}
      </div>
    </div>
  );
}
