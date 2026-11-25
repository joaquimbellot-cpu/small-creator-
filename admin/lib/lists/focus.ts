// Where focus goes when a side panel closes: the row link of the record that was shown last, else the first row link.
// Row links carry data-open-id="<record id>". Browser only; returns null while the rows are not on the page.
export function rowLinkToFocus(lastId: string | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const links = Array.from(document.querySelectorAll<HTMLElement>('a[data-open-id]'));
  // A hidden link (the table view and the cards view are never both on the page, but be safe) cannot take focus.
  const visible = links.filter((l) => l.getClientRects().length > 0);
  return visible.find((l) => l.dataset.openId === lastId) ?? visible[0] ?? null;
}
