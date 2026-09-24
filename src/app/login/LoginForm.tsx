'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginForm({ next, inviteCode }: { next: string; inviteCode: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setStage('code');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) { setBusy(false); setErr(error.message); return; }
    const dest = inviteCode ? `/join?code=${encodeURIComponent(inviteCode)}` : next;
    router.replace(dest);
    router.refresh();
  }

  return (
    <div className="center-page">
      <div className="card">
        <h1>Family Tree</h1>
        <p className="sub">
          {stage === 'email'
            ? 'Sign in with your email. We send a 6-digit code — no password to remember.'
            : `Enter the 6-digit code we sent to ${email}.`}
        </p>

        {stage === 'email' ? (
          <form onSubmit={sendCode}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email" className="input" type="email" required autoFocus
                autoComplete="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <div className="field">
              <label htmlFor="otp">Verification code</label>
              <input
                id="otp" className="input mono" inputMode="numeric" autoFocus
                autoComplete="one-time-code" placeholder="123456" maxLength={8}
                value={code} onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button" className="btn ghost sm" style={{ marginTop: 10 }}
              onClick={() => { setStage('email'); setErr(''); setCode(''); }}
            >
              ← Use a different email
            </button>
          </form>
        )}

        {inviteCode && (
          <p className="hint" style={{ marginTop: 14 }}>
            You&apos;ll join the tree with invite code <b className="mono">{inviteCode}</b> after signing in.
          </p>
        )}
      </div>
    </div>
  );
}
