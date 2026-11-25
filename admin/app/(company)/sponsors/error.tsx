'use client';
// Shown when a Sponsors page throws while rendering (a database outage, for example).
import { Button, Notice } from '@/components/ui';

export default function SponsorsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <div className="page-head"><h1 className="page-title">Sponsors</h1></div>
      <Notice tone="error" title="Something went wrong. ">The sponsors could not be shown. Your changes were not lost.</Notice>
      <p><Button onClick={reset}>Try again</Button></p>
    </>
  );
}
