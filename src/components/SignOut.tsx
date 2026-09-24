'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function SignOut() {
  const router = useRouter();
  return (
    <button
      className="btn sm ghost"
      onClick={async () => {
        await supabase().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
