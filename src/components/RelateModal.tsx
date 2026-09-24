'use client';

import { useMemo, useState } from 'react';
import { fullName, lifespan, type Person, type Relation, type UnionKind, type UnionStatus } from '@/lib/types';

export type RelKind = 'spouse' | 'child' | 'parent' | 'sibling';

export type RelateOpts = {
  relation: Relation;
  unionKind: UnionKind;
  unionStatus: UnionStatus;
  coParentId: string | null;
};

const TITLES: Record<RelKind, string> = {
  spouse: 'Add a spouse or partner',
  child: 'Add a child',
  parent: 'Add a parent',
  sibling: 'Add a sibling',
};

export default function RelateModal({
  kind,
  anchor,
  persons,
  spouses,
  anchorParents,
  onCancel,
  onPickExisting,
  onCreateNew,
}: {
  kind: RelKind;
  anchor: Person;
  persons: Person[];
  spouses: Person[];
  anchorParents: Person[];
  onCancel: () => void;
  onPickExisting: (id: string, opts: RelateOpts) => Promise<void>;
  onCreateNew: (opts: RelateOpts) => void;
}) {
  const [q, setQ] = useState('');
  const [relation, setRelation] = useState<Relation>('biological');
  const [unionKind, setUnionKind] = useState<UnionKind>('marriage');
  const [unionStatus, setUnionStatus] = useState<UnionStatus>('current');
  const [coParentId, setCoParentId] = useState<string | null>(spouses[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const opts = (): RelateOpts => ({
    relation,
    unionKind,
    unionStatus,
    coParentId: kind === 'child' ? coParentId : null,
  });

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return persons
      .filter((p) => p.id !== anchor.id)
      .filter((p) => !needle || fullName(p).toLowerCase().includes(needle))
      .slice(0, 40);
  }, [persons, q, anchor.id]);

  const siblingBlocked = kind === 'sibling' && anchorParents.length === 0;

  async function pick(id: string) {
    setBusy(true); setErr('');
    try { await onPickExisting(id, opts()); }
    catch (e) { setBusy(false); setErr(e instanceof Error ? e.message : 'Could not link.'); }
  }

  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <h2>{TITLES[kind]}</h2>
        <p className="sub">
          {kind === 'sibling'
            ? `Will share ${anchorParents.map(fullName).join(' & ') || 'no'} parents with ${fullName(anchor)}.`
            : `For ${fullName(anchor)}.`}
        </p>

        {siblingBlocked ? (
          <>
            <p className="err">
              {fullName(anchor)} has no parents recorded yet, so there is nothing for a sibling to
              share. Add a parent first, then add siblings under that parent.
            </p>
            <div className="modal-foot">
              <button className="btn" onClick={onCancel}>Close</button>
            </div>
          </>
        ) : (
          <>
            {/* relationship options */}
            {kind === 'spouse' ? (
              <div className="row">
                <div className="field">
                  <label htmlFor="uk">Type</label>
                  <select id="uk" className="select" value={unionKind}
                          onChange={(e) => setUnionKind(e.target.value as UnionKind)}>
                    <option value="marriage">Marriage</option>
                    <option value="partnership">Partnership</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="us">Status</label>
                  <select id="us" className="select" value={unionStatus}
                          onChange={(e) => setUnionStatus(e.target.value as UnionStatus)}>
                    <option value="current">Current</option>
                    <option value="divorced">Divorced</option>
                    <option value="separated">Separated</option>
                    <option value="widowed">Widowed</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="rl">Relationship</label>
                <select id="rl" className="select" value={relation}
                        onChange={(e) => setRelation(e.target.value as Relation)}>
                  <option value="biological">Biological</option>
                  <option value="adopted">Adopted</option>
                  <option value="step">Step</option>
                  <option value="foster">Foster</option>
                  <option value="guardian">Guardian</option>
                </select>
              </div>
            )}

            {kind === 'child' && spouses.length > 0 && (
              <div className="field">
                <label htmlFor="cp">Other parent</label>
                <select
                  id="cp" className="select" value={coParentId ?? ''}
                  onChange={(e) => setCoParentId(e.target.value || null)}
                >
                  {spouses.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                  <option value="">— only {fullName(anchor)} —</option>
                </select>
                <span className="hint">
                  Recording both parents is what keeps siblings grouped correctly.
                </span>
              </div>
            )}

            <button
              className="btn primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }}
              onClick={() => onCreateNew(opts())} disabled={busy}
            >
              + Create a new person
            </button>

            <div className="field">
              <label htmlFor="lk">…or link someone already in the tree</label>
              <input id="lk" className="input" placeholder="Search by name"
                     value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="rel-list" style={{ maxHeight: 220, overflow: 'auto' }}>
              {candidates.length === 0 && <p className="hint">No matching people.</p>}
              {candidates.map((p) => (
                <button key={p.id} onClick={() => pick(p.id)} disabled={busy}>
                  <span>
                    {fullName(p)}
                    {!p.living && <span className="tag"> †</span>}
                  </span>
                  <span className="tag">{lifespan(p)}</span>
                </button>
              ))}
            </div>

            {err && <p className="err">{err}</p>}

            <div className="modal-foot">
              <button className="btn" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
