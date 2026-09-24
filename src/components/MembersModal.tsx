'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Invite, Member, Role } from '@/lib/types';

export default function MembersModal({
  treeId, role, userId, onClose,
}: { treeId: string; role: Role; userId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = role === 'admin';

  const load = useCallback(async () => {
    const sb = supabase();
    const m = await sb.rpc('list_members', { p_tree_id: treeId });
    if (m.error) setErr(m.error.message);
    else setMembers((m.data ?? []) as Member[]);
    if (isAdmin) {
      const i = await sb.from('invites').select('*').eq('tree_id', treeId).order('created_at', { ascending: false });
      if (!i.error) setInvites((i.data ?? []) as Invite[]);
    }
  }, [treeId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function createInvite() {
    setBusy(true); setErr(''); setNote('');
    const { data, error } = await supabase().rpc('create_invite', {
      p_tree_id: treeId, p_role: newRole, p_label: label || null, p_days: 30, p_max_uses: 25,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setLabel('');
    setNote(`Invite ${data as string} created.`);
    load();
  }

  async function revoke(id: string) {
    const { error } = await supabase().from('invites').update({ revoked: true }).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function changeRole(uid: string, r: Role) {
    const { error } = await supabase().rpc('set_member_role', { p_tree_id: treeId, p_user_id: uid, p_role: r });
    if (error) setErr(error.message); else load();
  }

  async function remove(uid: string) {
    if (!confirm('Remove this person from the tree? They lose access immediately.')) return;
    const { error } = await supabase().rpc('remove_member', { p_tree_id: treeId, p_user_id: uid });
    if (error) setErr(error.message); else load();
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNote('Copied to clipboard.'); }
    catch { setNote(text); }
  }

  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal lg">
        <h2>People with access</h2>
        <p className="sub">
          Admins manage access. Editors add and change people. Viewers can only look.
        </p>

        <table className="tbl">
          <thead>
            <tr><th>Email</th><th>Role</th><th /></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>
                  {m.email ?? m.display_name ?? m.user_id.slice(0, 8)}
                  {m.is_owner && <span className="pill" style={{ marginLeft: 6 }}>owner</span>}
                  {m.user_id === userId && <span className="hint"> (you)</span>}
                </td>
                <td>
                  {isAdmin && !m.is_owner ? (
                    <select className="select" style={{ padding: '4px 6px' }} value={m.role}
                            onChange={(e) => changeRole(m.user_id, e.target.value as Role)}>
                      <option value="admin">admin</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                  ) : (
                    <span className="pill">{m.role}</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {isAdmin && !m.is_owner && (
                    <button className="btn sm danger" onClick={() => remove(m.user_id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isAdmin && (
          <>
            <div className="divider" />
            <h2 style={{ fontSize: 15 }}>Invite the rest of the family</h2>
            <p className="sub">
              Send someone a code or a link. They sign in with their own email and land straight in
              this tree.
            </p>

            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="lbl">Who is it for? (optional)</label>
                <input id="lbl" className="input" placeholder="e.g. Uncle Imran"
                       value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="field" style={{ maxWidth: 130 }}>
                <label htmlFor="rl2">Their role</label>
                <select id="rl2" className="select" value={newRole}
                        onChange={(e) => setNewRole(e.target.value as 'editor' | 'viewer')}>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              </div>
              <button className="btn primary" style={{ flex: '0 0 auto', marginBottom: 12 }}
                      onClick={createInvite} disabled={busy}>
                Create invite
              </button>
            </div>

            {invites.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr><th>Code</th><th>For</th><th>Role</th><th>Used</th><th /></tr>
                </thead>
                <tbody>
                  {invites.map((i) => {
                    const dead = i.revoked || i.uses >= i.max_uses ||
                      (i.expires_at !== null && new Date(i.expires_at) < new Date());
                    return (
                      <tr key={i.id} style={dead ? { opacity: 0.45 } : undefined}>
                        <td className="mono"><b>{i.code}</b></td>
                        <td>{i.label ?? '—'}</td>
                        <td>{i.role}</td>
                        <td>{i.uses}/{i.max_uses}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!dead && (
                            <>
                              <button className="btn sm ghost"
                                      onClick={() => copy(`${origin}/join?code=${i.code}`)}>
                                Copy link
                              </button>
                              <button className="btn sm ghost" onClick={() => revoke(i.id)}>Revoke</button>
                            </>
                          )}
                          {dead && <span className="hint">inactive</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {err && <p className="err">{err}</p>}
        {note && <p className="ok">{note}</p>}

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
