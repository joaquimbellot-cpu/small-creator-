'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Badge, Button, Notice, Table } from '@/components/ui';
import { MAX_IMPORT_BYTES } from '@/lib/creators/constants';
import s from '../creators.module.css';

type Row = { line: number; name: string; email: string; status: 'new' | 'duplicate' | 'error'; reason?: string };
type Preview = { counts: { new: number; duplicate: number; error: number }; rows: Row[] };
const TONE = { new: 'good', duplicate: 'warn', error: 'bad' } as const;

export function ImportClient() {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(mode: 'preview' | 'commit') {
    if (!file) { setError('Choose a CSV file first.'); return null; }
    if (file.size > MAX_IMPORT_BYTES) { setError('The file is larger than 1 MB.'); return null; }
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/creators/import?mode=${mode}`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || 'Could not read the file.'); return null; }
      return json;
    } catch {
      setError('Could not reach the server.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    setDone(null); setPreview(null);
    const j = await send('preview');
    if (j) setPreview(j);
  }
  async function onCommit() {
    const j = await send('commit');
    if (j) { setDone(j); setPreview(null); setFile(null); if (ref.current) ref.current.value = ''; }
  }

  return (
    <section aria-label="Upload">
      <div className={s.stack}>
        <div className={s.fileRow}>
          <label className="sr-only" htmlFor="csv-file">CSV file</label>
          <input id="csv-file" ref={ref} type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(''); }} />
          <Button onClick={onPreview} loading={busy && !preview} disabled={!file}>Preview</Button>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {done ? (
          <Notice tone="success" title={`Imported ${done.imported} new creators`}>
            {done.skipped ? `${done.skipped} rows were skipped. ` : ''}<Link href="/creators">Go to the creators list</Link>
          </Notice>
        ) : null}
      </div>
      {preview ? (
        <>
          <p>
            <Badge tone="good">{preview.counts.new} new</Badge>{' '}
            <Badge tone="warn">{preview.counts.duplicate} duplicate</Badge>{' '}
            <Badge tone="bad">{preview.counts.error} error</Badge>
          </p>
          <div className={s.stack}>
            <div>
              <Button onClick={onCommit} loading={busy} disabled={preview.counts.new === 0}>Import {preview.counts.new} new creators</Button>
            </div>
          </div>
          <Table label="Import preview">
            <thead><tr><th>Line</th><th>Name</th><th>Email</th><th>Result</th></tr></thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td><td>{r.name || '—'}</td><td>{r.email || '—'}</td>
                  <td><Badge tone={TONE[r.status]}>{r.status}</Badge>{r.reason ? <span className={s.sub}>{r.reason}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      ) : null}
    </section>
  );
}
