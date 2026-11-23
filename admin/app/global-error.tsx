'use client';
// Last resort: replaces the whole page when even the root layout fails. It brings its own html and body and styles.
import { useEffect } from 'react';
import './tokens.css';
import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('global error', error.digest ?? '');
  }, [error]);
  return (
    <html lang="en">
      <body>
        <main className="state state--page" role="alert">
          <h1 className="state__title">Something went wrong</h1>
          <p className="state__text">Something went wrong. Your last change may not have been saved. Try again, or go back to the Overview.</p>
          <div className="state__actions">
            <button type="button" onClick={() => reset()} style={{ minHeight: 48, padding: '0 24px', border: '1px solid var(--fg)', borderRadius: 8, background: 'var(--fg)', color: 'var(--bg)', font: 'inherit', cursor: 'pointer' }}>Try again</button>
            <a href="/overview">Back to the Overview</a>
          </div>
        </main>
      </body>
    </html>
  );
}
