'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Person, Sex } from '@/lib/types';

export type PersonDraft = Partial<Person> & { given_name?: string };

const SEXES: { v: Sex; label: string }[] = [
  { v: 'm', label: 'Male' },
  { v: 'f', label: 'Female' },
  { v: 'o', label: 'Other' },
  { v: 'u', label: 'Not recorded' },
];

export default function PersonModal({
  treeId,
  person,
  title,
  photoUrl,
  onCancel,
  onSave,
}: {
  treeId: string;
  person: PersonDraft | null;
  title: string;
  photoUrl?: string;
  onCancel: () => void;
  onSave: (values: PersonDraft) => Promise<void>;
}) {
  const [f, setF] = useState<PersonDraft>({
    given_name: '', family_name: '', nickname: '', sex: 'u',
    birth_date: '', birth_place: '', death_date: '', death_place: '',
    living: true, occupation: '', notes: '', photo_path: null, photo_url: '',
    ...(person ?? {}),
  });
  const [preview, setPreview] = useState<string | undefined>(photoUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPreview(photoUrl), [photoUrl]);

  const set = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setErr('Photo must be under 8 MB.'); return; }
    setUploading(true); setErr('');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const id = person?.id ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    const path = `${treeId}/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase().storage.from('photos').upload(path, file, {
      upsert: true, contentType: file.type || undefined,
    });
    setUploading(false);
    if (error) { setErr(`Upload failed: ${error.message}`); return; }
    set('photo_path', path);
    setPreview(URL.createObjectURL(file));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.given_name?.trim() && !f.family_name?.trim()) {
      setErr('Give the person at least a first or last name.');
      return;
    }
    setBusy(true); setErr('');
    try {
      await onSave(f);
    } catch (e2) {
      setBusy(false);
      setErr(e2 instanceof Error ? e2.message : 'Could not save.');
    }
  }

  const shown = preview ?? (f.photo_url || undefined);

  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="modal" onSubmit={submit}>
        <h2>{title}</h2>
        <p className="sub">Dates can be rough — &ldquo;1942&rdquo;, &ldquo;c. 1950&rdquo; and &ldquo;March 1911&rdquo; are all fine.</p>

        {/* ---- photo ---- */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 76, height: 76, borderRadius: '50%', flex: '0 0 auto',
              border: `2px ${f.living ? 'solid var(--ok)' : 'dashed var(--muted)'}`,
              background: 'var(--panel-2)', overflow: 'hidden',
              display: 'grid', placeItems: 'center',
            }}
          >
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>No photo</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <button type="button" className="btn sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Uploading…' : shown ? 'Replace photo' : 'Upload photo'}
            </button>
            {shown && (
              <button
                type="button" className="btn sm ghost" style={{ marginLeft: 6 }}
                onClick={() => { set('photo_path', null); set('photo_url', ''); setPreview(undefined); }}
              >
                Remove
              </button>
            )}
            <p className="hint" style={{ marginTop: 6 }}>JPG/PNG/WebP, up to 8 MB. Only members of this tree can see it.</p>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="gn">First name</label>
            <input id="gn" className="input" autoFocus value={f.given_name ?? ''}
                   onChange={(e) => set('given_name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fn">Last name</label>
            <input id="fn" className="input" value={f.family_name ?? ''}
                   onChange={(e) => set('family_name', e.target.value)} />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="nk">Also known as</label>
            <input id="nk" className="input" placeholder="nickname" value={f.nickname ?? ''}
                   onChange={(e) => set('nickname', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sx">Sex</label>
            <select id="sx" className="select" value={f.sex ?? 'u'}
                    onChange={(e) => set('sex', e.target.value as Sex)}>
              {SEXES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* ---- living status ---- */}
        <div className="field">
          <label>Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map((alive) => (
              <button
                key={String(alive)} type="button"
                className={`btn sm ${f.living === alive ? 'primary' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => set('living', alive)}
              >
                {alive ? 'Living' : 'Deceased'}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="bd">Born</label>
            <input id="bd" className="input" placeholder="1942" value={f.birth_date ?? ''}
                   onChange={(e) => set('birth_date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bp">Birthplace</label>
            <input id="bp" className="input" placeholder="town or city" value={f.birth_place ?? ''}
                   onChange={(e) => set('birth_place', e.target.value)} />
          </div>
        </div>

        {!f.living && (
          <div className="row">
            <div className="field">
              <label htmlFor="dd">Died</label>
              <input id="dd" className="input" placeholder="2018" value={f.death_date ?? ''}
                     onChange={(e) => set('death_date', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dp">Place of death</label>
              <input id="dp" className="input" value={f.death_place ?? ''}
                     onChange={(e) => set('death_place', e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="oc">Occupation</label>
          <input id="oc" className="input" value={f.occupation ?? ''}
                 onChange={(e) => set('occupation', e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="nt">Notes</label>
          <textarea id="nt" className="textarea" value={f.notes ?? ''}
                    onChange={(e) => set('notes', e.target.value)} />
        </div>

        {err && <p className="err">{err}</p>}

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
