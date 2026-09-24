'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Where an emailed sign-in link lands.
 *
 * Supabase can hand the session back in three different shapes depending on
 * the project's flow and the age of the link. All three are handled here, on
 * the client, because the implicit flow puts the tokens in the URL fragment —
 * which the server never receives.
 */
export default function CallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState('');
  const done = useRef(false);

  useEffect(() => {
    const sb = supabase();
    const next = params.get('next') || '/trees';

    const finish = () => {
      if (done.current) return;
      done.current = true;
      router.replace(next);
      router.refresh();
    };

    // An error can come back in the query string or the fragment.
    const hash = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '',
    );
    const failed =
      params.get('error_description') || params.get('error') ||
      hash.get('error_description') || hash.get('error');
    if (failed) { setErr(failed); return; }

    // 1. Implicit flow: supabase-js parses the fragment itself on startup and
    //    emits SIGNED_IN. Also poll once, in case it landed before we mounted.
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) finish();
    });
    sb.auth.getSession().then(({ data }) => { if (data.session) finish(); });

    // 2. PKCE link opened in the browser that requested it.
    const code = params.get('code');
    if (code) {
      sb.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) finish();
        else if (!done.current) setErr(error.message);
      });
    }

    // 3. Older token_hash style link.
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    if (tokenHash && type) {
      sb.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
        if (!error) finish();
        else if (!done.current) setErr(error.message);
      });
    }

    const giveUp = setTimeout(() => {
      if (!done.current) {
        setErr('That link could not be completed. It may have already been used, or expired.');
      }
    }, 9000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(giveUp); };
  }, [params, router]);

  return (
    <div className="center-page">
      <div className="card">
        <h1>{err ? 'Sign-in failed' : 'Signing you in…'}</h1>
        {err ? (
          <>
            <p className="err">{err}</p>
            <a className="btn primary" href="/login" style={{ width: '100%', justifyContent: 'center' }}>
              Request a new link
            </a>
          </>
        ) : (
          <p className="sub">One moment.</p>
        )}
      </div>
    </div>
  );
}
