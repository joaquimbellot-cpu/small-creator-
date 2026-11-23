import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
// Fonts come from npm packages, so no page waits for Google Fonts. Same weights as before.
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/newsreader/300.css';
import '@fontsource/newsreader/300-italic.css';
import '@fontsource/newsreader/400.css';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Smallfold back office', template: '%s · Smallfold back office' },
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Every page is rendered per request so the proxy's CSP nonce reaches Next's scripts.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
