import { describe, expect, it } from 'vitest';
import { dateFormatter } from './dates';
import { readFormLimited, UploadTooLarge } from './readUpload';
import { safeLinkedIn, safeMailto, validateContact } from '../sponsors/schema';
import { cleanVideoUrl, recordSchema } from '../sponsorships/schemas';

describe('dateFormatter', () => {
  it('writes September as Sep', () => {
    expect(dateFormatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date('2026-09-20T12:00:00Z'))).toBe('20 Sep 2026');
    expect(dateFormatter({ dateStyle: 'medium' }).format(new Date('2026-09-20T12:00:00Z'))).toBe('20 Sep 2026');
  });
});

describe('links rendered from stored data (SR-09, SR-18)', () => {
  it('mailto only for a plain address', () => {
    expect(safeMailto('a@example.test')).toBe('mailto:a@example.test');
    expect(safeMailto('a@example.test?cc=x@example.test')).toBeNull();
    expect(safeMailto('a@example.test&bcc=x')).toBeNull();
    expect(safeMailto('a%40example.test')).toBeNull();
    expect(safeMailto(null)).toBeNull();
  });
  it('the contact form refuses ? & %', () => {
    const r = validateContact({ full_name: 'Sam', email: 'a@example.test?cc=b', role_title: '', phone: '', linkedin_url: '' });
    expect(r.ok).toBe(false);
  });
  it('LinkedIn only https on linkedin.com', () => {
    expect(safeLinkedIn('https://www.linkedin.com/in/sam')).toBeTruthy();
    expect(safeLinkedIn('https://evil.example/linkedin.com')).toBeNull();
    expect(safeLinkedIn('http://www.linkedin.com/in/sam')).toBeNull();
    expect(safeLinkedIn('javascript:alert(1)')).toBeNull();
  });
  it('video links only https on YouTube', () => {
    expect(cleanVideoUrl('https://youtu.be/abc')).toBeTruthy();
    expect(cleanVideoUrl('https://evil.example/watch')).toBeNull();
  });
});

describe('sponsorship record input', () => {
  const base = { creatorId: '3e96746b-faac-4f35-9a47-474760ae7a19', brandName: 'Acme', date: '2026-11-20' };
  it('a new sponsor is created only when createBrand is true', () => {
    expect(recordSchema().parse(base).createBrand).toBe(false);
    expect(recordSchema().parse({ ...base, createBrand: true }).createBrand).toBe(true);
  });
});

describe('readFormLimited (SR-11)', () => {
  const form = (bytes: number) => {
    const fd = new FormData();
    fd.set('file', new File([new Uint8Array(bytes)], 'a.csv'));
    return new Request('http://x.test/', { method: 'POST', body: fd });
  };
  it('reads a small upload', async () => {
    expect((await readFormLimited(form(100), 1000)).get('file')).toBeInstanceOf(File);
  });
  it('refuses by the declared length without reading', async () => {
    const req = new Request('http://x.test/', { method: 'POST', headers: { 'content-length': '999999999', 'content-type': 'multipart/form-data; boundary=x' }, body: 'x' });
    await expect(readFormLimited(req, 1000)).rejects.toBeInstanceOf(UploadTooLarge);
  });
  it('stops while reading when the length was not declared or was a lie', async () => {
    await expect(readFormLimited(form(200_000), 1000)).rejects.toBeInstanceOf(UploadTooLarge);
  });
});
