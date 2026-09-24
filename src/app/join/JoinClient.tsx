'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function JoinClient({ code }: { code: string }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const once = useRef(false);

  useEffect(() => {
    if (once.current || !code) return;
    once.current = true;
    (async () => {
      const { data, error } = await supabase().rpc('redeem_invite', { p_code: code });
      if (error) setErr(error.message);
      else router.replace(`/t/${data as string}`);
    })();
  }, [code, router]);

  return (
    <div className="center-page">
      <div className="card">
        <h1>{err ? 'Could not join' : 'Joining…'}</h1>
        {err ? (
          <>
            <p className="err">{err}</p>
            <a className="btn" href="/trees">Back to your trees</a>
          </>
        ) : (
          <p className="sub">Adding you to the family tree.</p>
        )}
      </div>
    </div>
  );
}
