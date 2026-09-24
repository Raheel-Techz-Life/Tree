'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Implicit rather than PKCE, deliberately.
        //
        // PKCE keeps a code verifier in the browser that asked for the link,
        // and only that browser can complete the sign-in. Email links get
        // opened wherever the mail app feels like — a phone, a webview, a
        // different browser on a different machine — and every one of those
        // fails with "code verifier not found". Implicit returns the session
        // in the URL itself, so any browser can finish the job.
        flowType: 'implicit',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}

let singleton: ReturnType<typeof createClient> | null = null;
export function supabase() {
  if (!singleton) singleton = createClient();
  return singleton;
}
