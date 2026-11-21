import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Smallfold back office', template: '%s · Smallfold back office' },
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

const FONTS =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300&display=swap';

// Every page is rendered per request so the proxy's CSP nonce reaches Next's scripts.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
