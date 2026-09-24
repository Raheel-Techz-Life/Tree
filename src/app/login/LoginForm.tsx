'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError);

  const dest = inviteCode ? `/join?code=${encodeURIComponent(inviteCode)}` : next;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    // emailRedirectTo is what makes the link in the email come back here.
    const redirect =
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: redirect },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  // Only usable if the project has custom SMTP and a template containing
  // {{ .Token }}. Harmless otherwise — the field just stays empty.
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setErr('');
    const { error } = await supabase().auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: 'email',
    });
    if (error) { setBusy(false); setErr(error.message); return; }
    router.replace(dest);
    router.refresh();
  }

  return (
    <div className="center-page">
      <div className="card">
        <h1>Family Tree</h1>

        {!sent ? (
          <>
            <p className="sub">
              Sign in with your email. We&apos;ll send you a link — no password to remember.
            </p>
            <form onSubmit={send}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email" className="input" type="email" required autoFocus
                  autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {err && <p className="err">{err}</p>}
              <button
                className="btn primary"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={busy}
              >
                {busy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="sub">
              Check <b>{email}</b> and tap the sign-in link. You can close this tab.
            </p>

            <p className="hint" style={{ marginBottom: 16 }}>
              Nothing after a minute? Look in spam. The free Supabase mailer is
              rate-limited, so wait before asking for another.
            </p>

            <div className="divider" />

            <form onSubmit={verify}>
              <div className="field">
                <label htmlFor="otp">Got a 6-digit code instead of a link?</label>
                <input
                  id="otp" className="input mono" inputMode="numeric"
                  autoComplete="one-time-code" placeholder="123456" maxLength={8}
                  value={code} onChange={(e) => setCode(e.target.value)}
                />
                <span className="hint">
                  Only if this project uses custom SMTP. Otherwise use the link.
                </span>
              </div>
              {err && <p className="err">{err}</p>}
              <button className="btn" disabled={busy || !code.trim()}
                      style={{ width: '100%', justifyContent: 'center' }}>
                {busy ? 'Checking…' : 'Sign in with code'}
              </button>
            </form>

            <button
              type="button" className="btn ghost sm" style={{ marginTop: 12 }}
              onClick={() => { setSent(false); setErr(''); setCode(''); }}
            >
              ← Use a different email
            </button>
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
