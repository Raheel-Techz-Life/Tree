'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function TreeActions() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'new' | 'join' | null>(null);
  const [err, setErr] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('new'); setErr('');
    const { data, error } = await supabase().rpc('create_tree', { p_name: name });
    setBusy(null);
    if (error) return setErr(error.message);
    router.push(`/t/${data as string}`);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy('join'); setErr('');
    const { data, error } = await supabase().rpc('redeem_invite', { p_code: code });
    setBusy(null);
    if (error) return setErr(error.message);
    router.push(`/t/${data as string}`);
  }

  return (
    <>
      <form onSubmit={create}>
        <div className="field">
          <label htmlFor="tname">Start a new tree</label>
          <div className="row">
            <input
              id="tname" className="input" placeholder="e.g. Smith family, or Mum's side"
              value={name} onChange={(e) => setName(e.target.value)} required
            />
            <button className="btn primary" style={{ flex: '0 0 auto' }} disabled={busy !== null}>
              {busy === 'new' ? 'Creating…' : 'Create'}
            </button>
          </div>
          <span className="hint">You become the admin and can invite the rest of the family.</span>
        </div>
      </form>

      <form onSubmit={join} style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="icode">Join with an invite code</label>
          <div className="row">
            <input
              id="icode" className="input mono" placeholder="A1B2C3D4" maxLength={12}
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required
            />
            <button className="btn" style={{ flex: '0 0 auto' }} disabled={busy !== null}>
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
        </div>
      </form>

      {err && <p className="err">{err}</p>}
    </>
  );
}
