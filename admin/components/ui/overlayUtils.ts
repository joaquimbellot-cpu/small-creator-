// Shared by SidePanel and the filter drawer: scroll lock and focus trap that cooperate with other dialogs.

let locks = 0;
let saved = '';

/** Stop the page behind a drawer from scrolling. Counted, so two overlays at once restore it correctly. Returns the unlock function. */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    locks -= 1;
    if (locks === 0) document.body.style.overflow = saved;
  };
}

export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/** Is the event inside a different modal dialog (for example a confirm Modal opened from the panel)? Then leave it alone. */
export function inOtherDialog(e: Event, me: HTMLElement): boolean {
  const t = e.target as Element | null;
  const d = t?.closest?.('[aria-modal="true"]');
  return !!d && d !== me;
}

/** Keep Tab inside `node`. Call from a keydown handler. */
export function trapTab(e: KeyboardEvent, node: HTMLElement) {
  if (e.key !== 'Tab') return;
  const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (items.length === 0) { e.preventDefault(); node.focus(); return; }
  const a = items[0];
  const z = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === a || active === node)) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && active === z) { e.preventDefault(); a.focus(); }
  else if (!node.contains(active)) { e.preventDefault(); a.focus(); }
}
