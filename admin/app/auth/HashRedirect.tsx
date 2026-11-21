'use client';
// If a Supabase email link landed with tokens in the URL fragment (#access_token=...), hand over to /auth/hash.
import { useEffect } from 'react';

export function HashRedirect() {
  useEffect(() => {
    const h = window.location.hash;
    if (h.includes('access_token=') || h.includes('error=')) window.location.replace('/auth/hash' + h);
  }, []);
  return null;
}
