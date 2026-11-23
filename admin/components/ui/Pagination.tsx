// Previous / next pager made of links (works in server components).
//   <Pagination page={1} pageSize={25} total={140} hrefFor={(p) => `?page=${p}`} />
// Pages start at 1. Shows "26–50 of 140". Renders nothing when there is only one page and total is 0.
import { LinkButton } from './Button';
import s from './ui.module.css';

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className={s.pager} aria-label="Pagination">
      <span>{from}–{to} of {total}</span>
      <span className={s.pagerLinks}>
        {page > 1 ? <LinkButton href={hrefFor(Math.min(page - 1, pages))} variant="ghost" size="sm">Previous</LinkButton> : null}
        {page < pages ? <LinkButton href={hrefFor(page + 1)} variant="ghost" size="sm">Next</LinkButton> : null}
      </span>
    </nav>
  );
}
