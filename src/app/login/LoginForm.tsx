'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function LoginForm({
  next,
  inviteCode,
  initialError = '',
}: {
  next: string;
  inviteCode: string;
  initialError?: string;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [err, setErr] = useState(initialError);
  const [showEmail, setShowEmail] = useState(false);

  const dest = inviteCode ? `/join?code=${encodeURIComponent(inviteCode)}` : next;
  const redirect = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;

  async function google() {
    setBusy('google'); setErr('');
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirect() },
    });
    if (error) { setBusy(null); setErr(error.message); }
    // on success the browser navigates away to Google
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email'); setErr('');
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: redirect() },
    });
    setBusy(null);
    if (error) setErr(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="center-page">
        <div className="card">
          <h1>Check your email</h1>
          <p className="sub">
            We sent a sign-in link to <b>{email}</b>. Open it on any device — it works
            anywhere.
          </p>
          <p className="hint" style={{ marginBottom: 18 }}>
            Nothing after a minute? Check spam. The free mailer is rate-limited, so wait
            before asking for another.
          </p>
          <button
            className="btn" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { setSent(false); setErr(''); }}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-page">
      <div className="card">
        <h1>Family Tree</h1>
        <p className="sub">Sign in to see and add to your family&apos;s tree.</p>

        <button
          className="btn" onClick={google} disabled={busy !== null}
          style={{ width: '100%', justifyContent: 'center', gap: 10, minHeight: 46 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
          </svg>
          {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>

        {err && <p className="err">{err}</p>}

        {!showEmail ? (
          <button
            className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            onClick={() => setShowEmail(true)}
          >
            No Google account? Sign in by email
          </button>
        ) : (
          <>
            <div className="divider" />
            <form onSubmit={sendLink}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email" className="input" type="email" required autoFocus
                  autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
                <span className="hint">We&apos;ll email you a sign-in link.</span>
              </div>
              <button
                className="btn" style={{ width: '100%', justifyContent: 'center' }}
                disabled={busy !== null}
              >
                {busy === 'email' ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          </>
        )}

        {inviteCode && (
          <p className="hint" style={{ marginTop: 14 }}>
            You&apos;ll join the tree with invite code <b className="mono">{inviteCode}</b> once
            you&apos;re signed in.
          </p>
        )}
      </div>
    </div>
  );
}
