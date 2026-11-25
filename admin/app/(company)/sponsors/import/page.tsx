import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff';
import { ImportClient } from './ImportClient';
import s from '../sponsors.module.css';

export const metadata = { title: 'Import sponsors' };

const DOCS: [string, string][] = [
  ['name', 'Required. Up to 200 characters. A name already in Smallfold (any letter case) is skipped as a duplicate.'],
  ['website', 'Optional. A web address; only https is kept.'],
  ['industry', 'Optional. Up to 200 characters.'],
  ['country', 'Optional. A two-letter code (US) or the country name.'],
  ['company_size', 'Optional. 1-10, 11-50, 51-200, 201-1000 or 1000+.'],
  ['niches', 'Optional. Several, separated by ; (for example cooking;diy). Slugs or names such as "Cooking and food".'],
  ['target_min_subs, target_max_subs', 'Optional. Subscribers the sponsor targets. 5k and 1.5M are fine.'],
  ['budget_min, budget_max', 'Optional. Typical budget per creator in US dollars (1000 or $1,000).'],
  ['relationship', 'Optional. prospect, contacted, talks, partner, past or do_not_contact (or the label, such as "In talks"). Empty means prospect.'],
  ['notes', 'Optional. Up to 5,000 characters.'],
  ['contact_name', 'Optional. Starts a contact person; the other contact columns need it. Becomes the main contact.'],
  ['contact_role, contact_email, contact_phone, contact_linkedin', 'Optional. LinkedIn must be an https linkedin.com address.'],
];

export default async function Page() {
  await requireStaff();
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Import sponsors</h1>
          <p className="page-lead">Upload a CSV file (up to 1 MB and 2,000 rows). You see a preview first; nothing is saved until you confirm.</p>
        </div>
        <Link href="/sponsors">Back to sponsors</Link>
      </div>
      <div className="split">
        <ImportClient />
        <section className="tile" aria-labelledby="cols">
          <h2 id="cols" style={{ fontSize: '1.25rem', marginTop: 0 }}>Columns</h2>
          <p className="muted" style={{ marginTop: 0 }}>The first row must be a header with these names, in any order. Only name is required. Cells that start with = + - or @ lose that character, so a spreadsheet cannot run them as a formula.</p>
          <table className={s.cols}>
            <tbody>{DOCS.map(([c, d]) => <tr key={c}><th scope="row"><code>{c}</code></th><td>{d}</td></tr>)}</tbody>
          </table>
          <a href="/api/sponsors/sample" download>Download a sample CSV</a>
        </section>
      </div>
    </>
  );
}
