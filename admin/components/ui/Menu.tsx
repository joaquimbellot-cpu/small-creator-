'use client';
// A small pop-over opened from a button (for "Saved views"). Closes on outside click, Esc, or when focus leaves it.
//   <Menu label="Saved views">
//     {({ close }) => (<>
//       <MenuItem onSelect={() => { apply(view); close(); }}>High reply rate</MenuItem>
//       <MenuRule />
//       <form>...a name field and a Save button...</form>
//     </>)}
//   </Menu>
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import k from './kit.module.css';

export function Menu({ label, children, align = 'right', variant = 'ghost' }: {
  /** Text on the button. */
  label: ReactNode;
  /** The content, or a function that gets `close`. */
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  align?: 'left' | 'right';
  variant?: 'ghost' | 'primary';
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A dialog above the menu (confirm Modal) handles its own Esc.
      if ((e.target as Element | null)?.closest?.('[aria-modal="true"]')) return;
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    // Capture phase, so Esc closes only the menu and not also a panel around it.
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div
      ref={box}
      className={k.menu}
      onBlur={(e) => { if (open && !box.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget) setOpen(false); }}
    >
      <Button ref={btn} variant={variant} size="sm" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>{label}</Button>
      {open ? <div id={id} className={`${k.pop} ${align === 'right' ? k.popRight : k.popLeft}`}>{typeof children === 'function' ? children({ close }) : children}</div> : null}
    </div>
  );
}

export function MenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return <button type="button" className={k.menuItem} onClick={onSelect}>{children}</button>;
}

export function MenuRule() {
  return <hr className={k.menuRule} />;
}
