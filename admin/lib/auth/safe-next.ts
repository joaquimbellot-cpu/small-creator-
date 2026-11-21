// Guards ?next= redirects: only same-site paths like /creators?q=a are allowed.
const SAFE = /^\/[A-Za-z0-9_\-/?=&%.]*$/;
const BAD = /[\\\u0000-\u001f\u007f]/;

export function safeNext(next: unknown, fallback = '/overview'): string {
  if (typeof next !== 'string' || next.length > 500 || !SAFE.test(next) || next.startsWith('//')) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  // Browsers drop tabs/newlines inside URLs, so "/%09/evil.com" would become "//evil.com".
  if (BAD.test(next) || BAD.test(decoded) || decoded.startsWith('//')) return fallback;
  return next;
}
