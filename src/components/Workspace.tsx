'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { buildIndex, layoutGraph } from '@/lib/layout';
import { fullName, lifespan, type Graph, type Person, type Role } from '@/lib/types';
import TreeCanvas, { type CanvasHandle } from './TreeCanvas';
import PersonPanel from './PersonPanel';
import PersonModal, { type PersonDraft } from './PersonModal';
import RelateModal, { type RelKind, type RelateOpts } from './RelateModal';
import MembersModal from './MembersModal';
import HistoryModal from './HistoryModal';
import SignOut from './SignOut';

type Editor =
  | { mode: 'create'; title: string }
  | { mode: 'edit'; title: string; person: Person }
  | { mode: 'createLinked'; title: string; anchorId: string; kind: RelKind; opts: RelateOpts };

export default function Workspace({
  treeId, treeName, role, userId, initial,
}: {
  treeId: string;
  treeName: string;
  isOwner: boolean;
  role: Role;
  userId: string;
  initial: Graph;
}) {
  const [graph, setGraph] = useState<Graph>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [relate, setRelate] = useState<{ kind: RelKind; anchorId: string } | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [err, setErr] = useState('');
  const canvas = useRef<CanvasHandle | null>(null);
  const [panelH, setPanelH] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canEdit = role === 'admin' || role === 'editor';

  /* On a phone the details panel is a bottom sheet drawn over the canvas, so
     the canvas has to be told how much of itself is covered. Measured rather
     than assumed: a short panel does not cover the full 60dvh. */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const measurePanel = useCallback((el: HTMLElement | null) => {
    if (!el) { setPanelH(0); return; }
    const ro = new ResizeObserver(() => setPanelH(el.getBoundingClientRect().height));
    ro.observe(el);
    setPanelH(el.getBoundingClientRect().height);
    panelRO.current?.disconnect();
    panelRO.current = ro;
  }, []);
  const panelRO = useRef<ResizeObserver | null>(null);
  useEffect(() => () => panelRO.current?.disconnect(), []);

  const bottomInset = isMobile ? panelH : 0;
  const sb = supabase;

  /* ------------------------------------------------------------------ */
  /* data                                                                */
  /* ------------------------------------------------------------------ */
  const reload = useCallback(async () => {
    const c = sb();
    const [p, u, e] = await Promise.all([
      c.from('persons').select('*').eq('tree_id', treeId),
      c.from('unions').select('*').eq('tree_id', treeId),
      c.from('parent_child').select('*').eq('tree_id', treeId),
    ]);
    setGraph({
      persons: (p.data ?? []) as Person[],
      unions: (u.data ?? []) as Graph['unions'],
      edges: (e.data ?? []) as Graph['edges'],
    });
  }, [treeId, sb]);

  /* live updates when a relative edits */
  useEffect(() => {
    const c = sb();
    let t: ReturnType<typeof setTimeout>;
    const bump = () => { clearTimeout(t); t = setTimeout(reload, 250); };
    const ch = c
      .channel(`tree:${treeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'persons', filter: `tree_id=eq.${treeId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unions', filter: `tree_id=eq.${treeId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parent_child', filter: `tree_id=eq.${treeId}` }, bump)
      .subscribe();
    return () => { clearTimeout(t); c.removeChannel(ch); };
  }, [treeId, reload, sb]);

  /* sign photo urls for everything currently in the tree */
  useEffect(() => {
    const paths = graph.persons.map((p) => p.photo_path).filter((v): v is string => !!v);
    const missing = paths.filter((p) => !photos.has(p));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb().storage.from('photos').createSignedUrls(missing, 3600);
      if (cancelled || !data) return;
      setPhotos((prev) => {
        const next = new Map(prev);
        data.forEach((d) => { if (d.signedUrl && d.path) next.set(d.path, d.signedUrl); });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [graph.persons, photos, sb]);

  const ix = useMemo(() => buildIndex(graph), [graph]);
  const layout = useMemo(() => layoutGraph(graph), [graph]);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return null;
    return graph.persons.filter((p) =>
      fullName(p).toLowerCase().includes(n) ||
      (p.nickname ?? '').toLowerCase().includes(n) ||
      (p.birth_place ?? '').toLowerCase().includes(n));
  }, [q, graph.persons]);

  const highlight = useMemo(
    () => (matches && matches.length ? new Set(matches.map((m) => m.id)) : null),
    [matches],
  );

  const selectedPerson = selected ? ix.persons.get(selected) ?? null : null;

  useEffect(() => {
    if (!selected || !isMobile || !panelH) return;
    const t = setTimeout(() => canvas.current?.ensureVisible(selected), 60);
    return () => clearTimeout(t);
  }, [selected, isMobile, panelH]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menuOpen) setMenuOpen(false);
      else if (editor) setEditor(null);
      else if (relate) setRelate(null);
      else if (showMembers) setShowMembers(false);
      else if (showHistory) setShowHistory(false);
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, relate, showMembers, showHistory, menuOpen]);

  /* ------------------------------------------------------------------ */
  /* mutations                                                           */
  /* ------------------------------------------------------------------ */
  const scrub = (d: PersonDraft) => ({
    given_name: (d.given_name ?? '').trim(),
    family_name: (d.family_name ?? '').trim(),
    nickname: (d.nickname ?? '').trim() || null,
    sex: d.sex ?? 'u',
    birth_date: (d.birth_date ?? '').trim() || null,
    birth_place: (d.birth_place ?? '').trim() || null,
    death_date: d.living ? null : (d.death_date ?? '').trim() || null,
    death_place: d.living ? null : (d.death_place ?? '').trim() || null,
    living: d.living ?? true,
    occupation: (d.occupation ?? '').trim() || null,
    notes: (d.notes ?? '').trim() || null,
    photo_path: d.photo_path ?? null,
    photo_url: (d.photo_url ?? '').trim() || null,
  });

  async function insertPerson(d: PersonDraft): Promise<string> {
    const { data, error } = await sb()
      .from('persons')
      .insert({ ...scrub(d), tree_id: treeId, created_by: userId })
      .select('id').single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  async function ensureUnion(a: string, b: string, status = 'unknown') {
    const exists = graph.unions.some(
      (u) => (u.partner_a === a && u.partner_b === b) || (u.partner_a === b && u.partner_b === a),
    );
    if (exists) return;
    await sb().from('unions').insert({ tree_id: treeId, partner_a: a, partner_b: b, status });
  }

  async function link(kind: RelKind, anchorId: string, otherId: string, opts: RelateOpts) {
    const c = sb();
    if (kind === 'spouse') {
      const dup = graph.unions.some(
        (u) => (u.partner_a === anchorId && u.partner_b === otherId) ||
               (u.partner_a === otherId && u.partner_b === anchorId));
      if (dup) throw new Error('These two are already recorded as partners.');
      const { error } = await c.from('unions').insert({
        tree_id: treeId, partner_a: anchorId, partner_b: otherId,
        kind: opts.unionKind, status: opts.unionStatus,
      });
      if (error) throw new Error(error.message);
      return;
    }

    if (kind === 'child') {
      const rows = [{ tree_id: treeId, parent_id: anchorId, child_id: otherId, relation: opts.relation }];
      if (opts.coParentId) {
        rows.push({ tree_id: treeId, parent_id: opts.coParentId, child_id: otherId, relation: opts.relation });
      }
      const { error } = await c.from('parent_child').upsert(rows, { onConflict: 'parent_id,child_id' });
      if (error) throw new Error(error.message);
      if (opts.coParentId) await ensureUnion(anchorId, opts.coParentId);
      return;
    }

    if (kind === 'parent') {
      const { error } = await c.from('parent_child').upsert(
        [{ tree_id: treeId, parent_id: otherId, child_id: anchorId, relation: opts.relation }],
        { onConflict: 'parent_id,child_id' });
      if (error) throw new Error(error.message);
      const existing = (ix.parentsOf.get(anchorId) ?? []).filter((p) => p !== otherId);
      if (existing.length === 1) await ensureUnion(existing[0], otherId);
      return;
    }

    // sibling: share the anchor's parents
    const parents = ix.parentsOf.get(anchorId) ?? [];
    if (!parents.length) throw new Error('Add a parent to this person first.');
    const { error } = await c.from('parent_child').upsert(
      parents.map((p) => ({ tree_id: treeId, parent_id: p, child_id: otherId, relation: opts.relation })),
      { onConflict: 'parent_id,child_id' });
    if (error) throw new Error(error.message);
  }

  async function saveEditor(values: PersonDraft) {
    setErr('');
    if (!editor) return;
    if (editor.mode === 'edit') {
      const { error } = await sb().from('persons').update(scrub(values)).eq('id', editor.person.id);
      if (error) throw new Error(error.message);
    } else if (editor.mode === 'create') {
      const id = await insertPerson(values);
      setSelected(id);
    } else {
      const id = await insertPerson(values);
      await link(editor.kind, editor.anchorId, id, editor.opts);
      setSelected(id);
    }
    setEditor(null);
    setRelate(null);
    await reload();
  }

  async function unlink(kind: 'parent' | 'child' | 'spouse', otherId: string) {
    if (!selectedPerson) return;
    const c = sb();
    let error;
    if (kind === 'spouse') {
      const u = graph.unions.find(
        (x) => (x.partner_a === selectedPerson.id && x.partner_b === otherId) ||
               (x.partner_a === otherId && x.partner_b === selectedPerson.id));
      if (!u) return;
      ({ error } = await c.from('unions').delete().eq('id', u.id));
    } else {
      const parent = kind === 'parent' ? otherId : selectedPerson.id;
      const child = kind === 'parent' ? selectedPerson.id : otherId;
      ({ error } = await c.from('parent_child').delete().eq('parent_id', parent).eq('child_id', child));
    }
    if (error) setErr(error.message); else reload();
  }

  async function removePerson() {
    if (!selectedPerson) return;
    const name = fullName(selectedPerson);
    if (!confirm(`Delete ${name}? Their relationship links go too. This cannot be undone.`)) return;
    const { error } = await sb().from('persons').delete().eq('id', selectedPerson.id);
    if (error) setErr(error.message);
    else { setSelected(null); reload(); }
  }

  /* ------------------------------------------------------------------ */
  /* import / export                                                     */
  /* ------------------------------------------------------------------ */
  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, tree: treeName, exported_at: new Date().toISOString(), ...graph }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${treeName.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      const raw = JSON.parse(await file.text()) as Partial<Graph>;
      if (!Array.isArray(raw.persons)) throw new Error('That file has no "persons" array.');
      if (!confirm(`Add ${raw.persons.length} people from this file into "${treeName}"? Existing people are kept.`)) return;

      const idMap = new Map<string, string>();
      const c = sb();

      const personRows = raw.persons.map((p) => {
        const nid = crypto.randomUUID();
        idMap.set(p.id, nid);
        return {
          id: nid, tree_id: treeId, created_by: userId,
          given_name: p.given_name ?? '', family_name: p.family_name ?? '',
          nickname: p.nickname ?? null, sex: p.sex ?? 'u',
          birth_date: p.birth_date ?? null, birth_place: p.birth_place ?? null,
          death_date: p.death_date ?? null, death_place: p.death_place ?? null,
          living: p.living ?? true, occupation: p.occupation ?? null,
          notes: p.notes ?? null, photo_url: p.photo_url ?? null, photo_path: null,
        };
      });
      for (let i = 0; i < personRows.length; i += 200) {
        const { error } = await c.from('persons').insert(personRows.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }

      const unionRows = (raw.unions ?? [])
        .map((u) => ({
          tree_id: treeId,
          partner_a: u.partner_a ? idMap.get(u.partner_a) ?? null : null,
          partner_b: u.partner_b ? idMap.get(u.partner_b) ?? null : null,
          kind: u.kind ?? 'marriage', status: u.status ?? 'unknown',
          start_date: u.start_date ?? null, end_date: u.end_date ?? null,
        }))
        .filter((u) => u.partner_a || u.partner_b);
      if (unionRows.length) {
        const { error } = await c.from('unions').insert(unionRows);
        if (error) throw new Error(error.message);
      }

      const edgeRows = (raw.edges ?? [])
        .map((x) => ({
          tree_id: treeId,
          parent_id: idMap.get(x.parent_id) ?? '',
          child_id: idMap.get(x.child_id) ?? '',
          relation: x.relation ?? 'biological',
        }))
        .filter((x) => x.parent_id && x.child_id);
      if (edgeRows.length) {
        const { error } = await c.from('parent_child').insert(edgeRows);
        if (error) throw new Error(error.message);
      }
      await reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Import failed.');
    }
  }

  /* ------------------------------------------------------------------ */
  const anchor = relate ? ix.persons.get(relate.anchorId) : undefined;
  const anchorSpouses = anchor
    ? (ix.unionsOf.get(anchor.id) ?? [])
        .map((u) => (u.partner_a === anchor.id ? u.partner_b : u.partner_a))
        .map((id) => (id ? ix.persons.get(id) : undefined))
        .filter((p): p is Person => !!p)
    : [];
  const anchorParents = anchor
    ? (ix.parentsOf.get(anchor.id) ?? []).map((id) => ix.persons.get(id)).filter((p): p is Person => !!p)
    : [];

  return (
    <div className="shell">
      <div className="topbar">
        <Link href="/trees" className="btn sm ghost icon-btn" title="All trees" aria-label="All trees">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="title">{treeName}</span>
        <span className="pill desktop-only">{role}</span>
        <span className="hint desktop-only">
          {graph.persons.length} people · {layout.generations} generation{layout.generations === 1 ? '' : 's'}
        </span>

        <span className="spacer" />

        <div className="searchwrap desktop-only">
          <input
            className="input" placeholder="Search people" value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {matches && q.trim() && (
            <div className="results">
              {matches.length === 0 && <p className="hint" style={{ padding: 8 }}>No match.</p>}
              {matches.slice(0, 30).map((m) => (
                <button key={m.id} onClick={() => { setSelected(m.id); canvas.current?.focus(m.id); setQ(''); }}>
                  <div>{fullName(m)} {!m.living && '†'}</div>
                  <div className="sub2">{lifespan(m) || 'no dates'}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn sm ghost icon-btn mobile-only"
          onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQ(''); }}
          aria-label="Search people"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
        </button>

        {canEdit && (
          <button className="btn sm primary" onClick={() => setEditor({ mode: 'create', title: 'Add a person' })}>
            + Person
          </button>
        )}

        <div className="desktop-only">
          <button className="btn sm" onClick={() => setShowMembers(true)}>People with access</button>
          <button className="btn sm ghost" onClick={() => setShowHistory(true)}>History</button>
          <button className="btn sm ghost" onClick={exportJson}>Export</button>
          {canEdit && <button className="btn sm ghost" onClick={() => fileRef.current?.click()}>Import</button>}
          <SignOut />
        </div>

        <button
          className="btn sm ghost icon-btn mobile-only" onClick={() => setMenuOpen(true)}
          aria-label="More actions"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
        </button>

        {canEdit && (
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
        )}
      </div>

      {searchOpen && (
        <div className="searchrow mobile-only">
          <div className="searchwrap">
            <input
              className="input" placeholder="Search people" autoFocus value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {matches && q.trim() && (
              <div className="results">
                {matches.length === 0 && <p className="hint" style={{ padding: 8 }}>No match.</p>}
                {matches.slice(0, 30).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelected(m.id); canvas.current?.focus(m.id);
                      setQ(''); setSearchOpen(false);
                    }}
                  >
                    <div>{fullName(m)} {!m.living && '†'}</div>
                    <div className="sub2">{lifespan(m) || 'no dates'}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn sm ghost" onClick={() => { setSearchOpen(false); setQ(''); }}>Done</button>
        </div>
      )}

      {err && <p className="err" style={{ padding: '6px 12px', margin: 0 }}>{err}</p>}

      <div className="main">
        <TreeCanvas
          layout={layout}
          photos={photos}
          selectedId={selected}
          highlight={highlight}
          bottomInset={bottomInset}
          onSelect={setSelected}
          onOpen={(id) => {
            const p = ix.persons.get(id);
            if (p && canEdit) setEditor({ mode: 'edit', title: `Edit ${fullName(p)}`, person: p });
          }}
          registerHandle={(h) => { canvas.current = h; }}
        />

        {graph.persons.length === 0 && (
          <div className="empty">
            <div className="box">
              <h2>Nobody in this tree yet</h2>
              <p>
                Start with yourself or with the oldest relative you know — a grandfather, say —
                then add their spouse, then their children.
              </p>
              {canEdit ? (
                <button className="btn primary" onClick={() => setEditor({ mode: 'create', title: 'Add the first person' })}>
                  Add the first person
                </button>
              ) : (
                <p className="hint">You have view-only access to this tree.</p>
              )}
            </div>
          </div>
        )}

        {selectedPerson && (
          <PersonPanel
            rootRef={measurePanel}
            person={selectedPerson}
            graph={graph}
            ix={ix}
            photoUrl={selectedPerson.photo_path ? photos.get(selectedPerson.photo_path) : undefined}
            canEdit={canEdit}
            onClose={() => setSelected(null)}
            onSelect={(id) => { setSelected(id); canvas.current?.focus(id); }}
            onEdit={() => setEditor({ mode: 'edit', title: `Edit ${fullName(selectedPerson)}`, person: selectedPerson })}
            onRelate={(kind) => setRelate({ kind, anchorId: selectedPerson.id })}
            onDelete={removePerson}
            onUnlink={unlink}
          />
        )}
      </div>

      {relate && anchor && (
        <RelateModal
          kind={relate.kind}
          anchor={anchor}
          persons={graph.persons}
          spouses={anchorSpouses}
          anchorParents={anchorParents}
          onCancel={() => setRelate(null)}
          onPickExisting={async (id, opts) => {
            await link(relate.kind, relate.anchorId, id, opts);
            setRelate(null);
            await reload();
          }}
          onCreateNew={(opts) => {
            setEditor({
              mode: 'createLinked',
              title: `New ${relate.kind} for ${fullName(anchor)}`,
              anchorId: relate.anchorId,
              kind: relate.kind,
              opts,
            });
          }}
        />
      )}

      {editor && (
        <PersonModal
          treeId={treeId}
          title={editor.title}
          person={editor.mode === 'edit' ? editor.person : null}
          photoUrl={
            editor.mode === 'edit' && editor.person.photo_path
              ? photos.get(editor.person.photo_path)
              : undefined
          }
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}

      {menuOpen && (
        <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <div className="modal">
            <div className="grab" />
            <h2>{treeName}</h2>
            <p className="sub">
              {graph.persons.length} people · {layout.generations} generation
              {layout.generations === 1 ? '' : 's'} · you are {role}
            </p>
            <div className="sheet-list">
              <button className="btn" onClick={() => { setMenuOpen(false); setShowMembers(true); }}>
                People with access
              </button>
              <button className="btn" onClick={() => { setMenuOpen(false); setShowHistory(true); }}>
                Change history
              </button>
              <button className="btn" onClick={() => { setMenuOpen(false); exportJson(); }}>
                Export JSON
              </button>
              {canEdit && (
                <button className="btn" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}>
                  Import JSON
                </button>
              )}
              <div style={{ height: 6 }} />
              <SignOut />
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setMenuOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showMembers && (
        <MembersModal treeId={treeId} role={role} userId={userId} onClose={() => setShowMembers(false)} />
      )}
      {showHistory && <HistoryModal treeId={treeId} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
