import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff';
import { ImportClient } from './ImportClient';
import s from '../creators.module.css';

export const metadata = { title: 'Import creators' };

const DOCS: [string, string][] = [
  ['name', 'Required. Up to 120 characters.'],
  ['email', 'Required. A valid address. Must not exist yet.'],
  ['phone', 'Optional. Digits, spaces, + - and brackets, up to 30 characters.'],
  ['channel_url', 'Optional. The channel link: youtube.com/@handle, /channel/UC…, /c/name or /user/name.'],
  ['niche', 'Optional. Up to 120 characters.'],
  ['subscribers', 'Optional. A whole number from 0 to 100,000,000.'],
  ['status', 'Optional. new, contacted, replied, active, inactive or do_not_contact (shown as "Do not contact" on screen). Empty means new.'],
  ['notes', 'Optional. Up to 2000 characters.'],
];

export default async function Page() {
  await requireStaff();
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Import creators</h1>
          <p className="page-lead">Upload a CSV file (up to 1 MB and 2,000 rows). You see a preview first; nothing is saved until you confirm.</p>
        </div>
        <Link href="/creators">Back to creators</Link>
      </div>
      <div className="split">
        <ImportClient />
        <section className="tile" aria-labelledby="cols">
          <h2 id="cols" style={{ fontSize: '1.25rem', marginTop: 0 }}>Columns</h2>
          <p className="muted" style={{ marginTop: 0 }}>The first row must be a header with these names, in any order, in capitals or small letters. Only name and email are required. Rows with the same email or channel as an existing creator (or an earlier row) are skipped as duplicates.</p>
          <table className={s.cols}>
            <tbody>{DOCS.map(([c, d]) => <tr key={c}><th scope="row"><code>{c}</code></th><td>{d}</td></tr>)}</tbody>
          </table>
          <a href="/api/creators/sample" download>Download a sample CSV</a>
        </section>
      </div>
    </>
  );
}
