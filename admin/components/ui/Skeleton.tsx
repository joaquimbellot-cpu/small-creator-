// Placeholders while a list loads. Pulse stops under reduced motion. Server-safe.
//   {isPending ? <SkeletonRows rows={8} columns={5} /> : <Table>...</Table>}
//   {isPending ? <SkeletonCards count={6} /> : <CardGrid>...</CardGrid>}
import k from './kit.module.css';
import s from './ui.module.css';

export function SkeletonRows({ rows = 8, columns = 4, label = 'Loading the list' }: { rows?: number; columns?: number; label?: string }) {
  return (
    <div className={s.tableWrap} aria-busy="true">
      <table className={s.table}>
        <caption className="sr-only">{label}</caption>
        <tbody className={k.skel}>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }, (_, c) => (
                <td key={c} style={{ width: c === 0 ? `${30 + (r % 3) * 6}%` : undefined }}><span /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCards({ count = 6, label = 'Loading the list' }: { count?: number; label?: string }) {
  return (
    <div className={k.cards} aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`tile ${k.skelCard}`}><span style={{ width: '40%' }} /><span style={{ width: '70%' }} /><span /><span style={{ width: '55%' }} /></div>
      ))}
    </div>
  );
}
