'use client';
// Reads Supabase tokens from the URL fragment (implicit-flow email links), starts the session, then moves on.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export default function HashPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) { setFailed(true); return; }
    createBrowserSupabase().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) setFailed(true);
      else window.location.replace('/reset-password');
    });
  }, []);
  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__brand">Smallfold</div>
        {failed ? (
          <>
            <p className="auth__sub">That link is not valid any more.</p>
            <p className="auth__links"><Link href="/forgot-password">Request a new link</Link></p>
          </>
        ) : (
          <p className="auth__sub" role="status">One moment…</p>
        )}
      </div>
    </main>
  );
}
