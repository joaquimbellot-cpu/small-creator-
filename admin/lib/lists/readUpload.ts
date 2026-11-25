// Read an upload body without trusting it: refuse by the declared length first, then count while reading (SR-11).
// Multipart framing adds a little to the file, so the body limit is the file limit plus a small margin.
const FRAMING = 16 * 1024;

export class UploadTooLarge extends Error {}

export async function readFormLimited(req: Request, maxFileBytes: number): Promise<FormData> {
  const limit = maxFileBytes + FRAMING;
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new UploadTooLarge();
  if (!req.body) throw new Error('empty');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel().catch(() => {}); throw new UploadTooLarge(); }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { body.set(c, at); at += c.byteLength; }
  return new Response(body, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
}
