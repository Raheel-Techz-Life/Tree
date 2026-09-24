'use client';

import { fullName, lifespan, type Graph, type Person } from '@/lib/types';
import type { Index } from '@/lib/layout';

const SEX_LABEL: Record<string, string> = { m: 'Male', f: 'Female', o: 'Other', u: '—' };
const REL_LABEL: Record<string, string> = {
  biological: '', adopted: 'adopted', step: 'step', foster: 'foster', guardian: 'guardian',
};

export default function PersonPanel({
  rootRef,
  person,
  graph,
  ix,
  photoUrl,
  canEdit,
  onClose,
  onSelect,
  onEdit,
  onRelate,
  onDelete,
  onUnlink,
}: {
  rootRef?: (el: HTMLElement | null) => void;
  person: Person;
  graph: Graph;
  ix: Index;
  photoUrl?: string;
  canEdit: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onRelate: (kind: 'spouse' | 'child' | 'parent' | 'sibling') => void;
  onDelete: () => void;
  onUnlink: (kind: 'parent' | 'child' | 'spouse', otherId: string) => void;
}) {
  const get = (id: string) => ix.persons.get(id);
  const parents = (ix.parentsOf.get(person.id) ?? []).map(get).filter(Boolean) as Person[];
  const children = (ix.childrenOf.get(person.id) ?? []).map(get).filter(Boolean) as Person[];
  const unions = ix.unionsOf.get(person.id) ?? [];

  const siblings = (() => {
    const set = new Set<string>();
    for (const p of parents) for (const c of ix.childrenOf.get(p.id) ?? []) if (c !== person.id) set.add(c);
    return [...set].map(get).filter(Boolean) as Person[];
  })();

  const photo = photoUrl ?? person.photo_url ?? undefined;

  const Row = ({ p, tag, onRemove }: { p: Person; tag?: string; onRemove?: () => void }) => (
    <button onClick={() => onSelect(p.id)}>
      <span>
        {fullName(p)} {!p.living && <span className="tag">†</span>}
      </span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {tag && <span className="tag">{tag}</span>}
        {canEdit && onRemove && (
          <span
            role="button" tabIndex={0} className="tag" title="Unlink"
            style={{ color: 'var(--danger)', padding: '0 4px' }}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemove(); } }}
          >
            ✕
          </span>
        )}
      </span>
    </button>
  );

  return (
    <aside className="side" ref={rootRef}>
      <div className="grab mobile-only" />
      <header>
        <h2>{fullName(person)}</h2>
        <button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="body">
        <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'center' }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%', flex: '0 0 auto', overflow: 'hidden',
              border: `2px ${person.living ? 'solid var(--ok)' : 'dashed var(--muted)'}`,
              background: 'var(--panel-2)', display: 'grid', placeItems: 'center',
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>no photo</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{fullName(person)}</div>
            {person.nickname && <div className="hint">&ldquo;{person.nickname}&rdquo;</div>}
            <div style={{ marginTop: 6 }}>
              <span
                className="pill"
                style={
                  person.living
                    ? { background: 'transparent', color: 'var(--ok)', border: '1px solid var(--ok)' }
                    : { background: 'transparent', color: 'var(--muted)', border: '1px dashed var(--muted)' }
                }
              >
                {person.living ? 'Living' : 'Deceased'}
              </span>
            </div>
          </div>
        </div>

        <dl className="kv">
          <dt>Sex</dt><dd>{SEX_LABEL[person.sex]}</dd>
          <dt>Born</dt><dd>{person.birth_date || '—'}{person.birth_place ? `, ${person.birth_place}` : ''}</dd>
          {!person.living && (
            <>
              <dt>Died</dt>
              <dd>{person.death_date || '—'}{person.death_place ? `, ${person.death_place}` : ''}</dd>
            </>
          )}
          {person.occupation && (<><dt>Occupation</dt><dd>{person.occupation}</dd></>)}
        </dl>

        {person.notes && (
          <>
            <div className="section-title">Notes</div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{person.notes}</p>
          </>
        )}

        <div className="section-title">Parents ({parents.length})</div>
        <div className="rel-list">
          {parents.length === 0 && <p className="hint">None recorded.</p>}
          {parents.map((p) => (
            <Row key={p.id} p={p}
                 tag={REL_LABEL[ix.relationOf.get(`${p.id}|${person.id}`) ?? 'biological']}
                 onRemove={() => onUnlink('parent', p.id)} />
          ))}
        </div>

        <div className="section-title">Spouses &amp; partners ({unions.length})</div>
        <div className="rel-list">
          {unions.length === 0 && <p className="hint">None recorded.</p>}
          {unions.map((u) => {
            const otherId = u.partner_a === person.id ? u.partner_b : u.partner_a;
            const other = otherId ? get(otherId) : undefined;
            if (!other) return null;
            return (
              <Row key={u.id} p={other}
                   tag={u.status === 'current' ? u.kind : u.status}
                   onRemove={() => onUnlink('spouse', other.id)} />
            );
          })}
        </div>

        <div className="section-title">Children ({children.length})</div>
        <div className="rel-list">
          {children.length === 0 && <p className="hint">None recorded.</p>}
          {children.map((c) => (
            <Row key={c.id} p={c}
                 tag={REL_LABEL[ix.relationOf.get(`${person.id}|${c.id}`) ?? 'biological']}
                 onRemove={() => onUnlink('child', c.id)} />
          ))}
        </div>

        {siblings.length > 0 && (
          <>
            <div className="section-title">Siblings ({siblings.length})</div>
            <div className="rel-list">
              {siblings.map((s) => <Row key={s.id} p={s} />)}
            </div>
          </>
        )}
      </div>

      {canEdit && (
        <div className="foot">
          <div className="actions" style={{ width: '100%' }}>
            <button className="btn sm" onClick={() => onRelate('parent')}>+ Parent</button>
            <button className="btn sm" onClick={() => onRelate('spouse')}>+ Spouse</button>
            <button className="btn sm" onClick={() => onRelate('child')}>+ Child</button>
            <button className="btn sm" onClick={() => onRelate('sibling')}>+ Sibling</button>
          </div>
          <button className="btn sm primary" onClick={onEdit}>Edit details</button>
          <button className="btn sm danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </aside>
  );
}
