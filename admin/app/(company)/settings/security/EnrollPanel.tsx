'use client';
import { useState, useTransition } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { confirmEnrollAction, startEnrollAction, type EnrollResult } from './actions';

export function EnrollPanel() {
  const [setup, setSetup] = useState<EnrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function begin() {
    setError(null);
    start(async () => {
      const r = await startEnrollAction();
      if (r.error) setError(r.error);
      else setSetup(r);
    });
  }
  function confirm(formData: FormData) {
    setError(null);
    start(async () => {
      const r = await confirmEnrollAction({ factorId: setup!.factorId!, code: String(formData.get('code') ?? '') });
      if (r.error) setError(r.error);
      else setSetup(null);
    });
  }

  if (!setup) {
    return (
      <>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button onClick={begin} loading={pending}>Set up two-step login</Button>
      </>
    );
  }
  return (
    <div>
      <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
        <li>Open an authenticator app (for example Google Authenticator, 1Password or Authy).</li>
        <li>Scan this code, or type the key in by hand.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="qr" src={setup.qr} alt="QR code for your authenticator app" />
      <p className="muted" style={{ margin: '12px 0' }}>Key: <span className="mono" data-testid="totp-secret">{setup.secret}</span></p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form action={confirm} style={{ maxWidth: 280 }}>
        <Input label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
        <Button type="submit" loading={pending}>Turn on</Button>{' '}
        <Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
      </form>
    </div>
  );
}
