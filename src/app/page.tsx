import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="center-page">
        <div className="card">
          <h1>Not configured</h1>
          <p className="sub">
            Copy <code className="mono">.env.example</code> to{' '}
            <code className="mono">.env.local</code> and fill in your Supabase URL and anon key,
            then restart the dev server.
          </p>
          <p className="hint">See README.md, step 1.</p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? '/trees' : '/login');
}
