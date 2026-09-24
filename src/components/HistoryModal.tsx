'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { AuditEntry } from '@/lib/types';

const VERB: Record<string, string> = {
  insert: 'added', update: 'updated', delete: 'removed', join: 'joined',
};
const NOUN: Record<string, string> = {
  persons: 'person', unions: 'relationship', parent_child: 'parent link', tree_members: 'the tree',
};

export default function HistoryModal({ treeId, onClose }: { treeId: string; onClose: () => void }) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data } = await sb
        .from('audit_log')
        .select('id, actor_id, action, entity, entity_id, summary, at')
        .eq('tree_id', treeId).order('at', { ascending: false }).limit(200);
      setRows((data ?? []) as AuditEntry[]);
      const { data: mem } = await sb.rpc('list_members', { p_tree_id: treeId });
      const m = new Map<string, string>();
      for (const r of (mem ?? []) as { user_id: string; email: string | null }[]) {
        m.set(r.user_id, r.email ?? r.user_id.slice(0, 8));
      }
      setNames(m);
    })();
  }, [treeId]);

  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal lg">
        <h2>Change history</h2>
        <p className="sub">The last 200 changes anyone made to this tree.</p>

        {rows.length === 0 ? (
          <p className="hint">Nothing recorded yet.</p>
        ) : (
          <table className="tbl">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                    {new Date(r.at).toLocaleString()}
                  </td>
                  <td>{r.actor_id ? names.get(r.actor_id) ?? '—' : 'system'}</td>
                  <td>
                    {VERB[r.action] ?? r.action} {NOUN[r.entity] ?? r.entity}
                    {r.summary ? ` — ${r.summary}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
