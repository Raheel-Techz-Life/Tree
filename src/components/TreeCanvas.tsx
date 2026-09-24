'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NODE_H, NODE_W, type LayoutResult } from '@/lib/layout';
import { fullName, lifespan, type Person } from '@/lib/types';

type View = { tx: number; ty: number; k: number };

export type CanvasHandle = {
  fit: () => void;
  focus: (id: string) => void;
  /** Pan just enough to lift a node out from behind the bottom sheet. */
  ensureVisible: (id: string) => void;
};

const SEX_COLOR: Record<string, string> = {
  m: 'var(--m)', f: 'var(--f)', o: 'var(--o)', u: 'var(--u)',
};

function initials(p: Person) {
  const a = (p.given_name || '').trim()[0] ?? '';
  const b = (p.family_name || '').trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function clip(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export default function TreeCanvas({
  layout,
  photos,
  selectedId,
  highlight,
  bottomInset = 0,
  onSelect,
  onOpen,
  registerHandle,
}: {
  layout: LayoutResult;
  photos: Map<string, string>;
  selectedId: string | null;
  highlight: Set<string> | null;
  /** Height of anything overlapping the canvas from below (the mobile sheet). */
  bottomInset?: number;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  registerHandle: (h: CanvasHandle) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);

  // Gestures are pointer-events only, so one code path serves mouse, pen and
  // touch. Two live pointers means pinch; one means pan; a pan that never
  // moved more than TAP_SLOP is a tap.
  const TAP_SLOP = 8;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; x: number; y: number; tx: number; ty: number; moved: boolean; nodeId: string | null }
    | { kind: 'pinch'; dist: number; cx: number; cy: number; k: number; tx: number; ty: number }
    | null
  >(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  /* ---- track container size ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // usable height: the canvas minus whatever the bottom sheet covers
  const usableH = Math.max(120, size.h - bottomInset);

  const fit = useCallback(() => {
    if (!size.w || !usableH || !layout.nodes.length) return;
    // A true fit makes a wide family unreadable, and more so on a phone. Clamp
    // the zoom-out to something legible and let the user pan instead.
    // Graded with viewport width: the narrower the screen, the less a true
    // fit is worth, because shrinking past legibility helps nobody.
    const floor = size.w < 520 ? 0.55 : size.w < 900 ? 0.42 : 0.32;
    const k = Math.max(floor, Math.min(size.w / layout.width, usableH / layout.height, 1.1));
    const fitsV = layout.height * k <= usableH;
    setView({
      k,
      tx: (size.w - layout.width * k) / 2 - layout.minX * k,
      ty: fitsV ? (usableH - layout.height * k) / 2 - layout.minY * k : -layout.minY * k + 16,
    });
  }, [size.w, usableH, layout]);

  const focus = useCallback(
    (id: string) => {
      const n = layout.byId.get(id);
      if (!n || !size.w) return;
      setView((v) => {
        const k = Math.max(v.k, size.w < 900 ? 0.85 : 0.75);
        return {
          k,
          tx: size.w / 2 - (n.x + NODE_W / 2) * k,
          ty: usableH / 2 - (n.y + NODE_H / 2) * k,
        };
      });
    },
    [layout, size.w, usableH],
  );

  // Tapping a card near the bottom would hide it behind the sheet that the tap
  // just opened. Slide the view up by exactly the overlap, nothing more.
  const ensureVisible = useCallback(
    (id: string) => {
      const n = layout.byId.get(id);
      if (!n || !size.w) return;
      setView((v) => {
        const margin = 14;
        const top = n.y * v.k + v.ty;
        const bottom = top + NODE_H * v.k;
        const left = n.x * v.k + v.tx;
        const right = left + NODE_W * v.k;
        let { tx, ty } = v;
        if (bottom > usableH - margin) ty -= bottom - (usableH - margin);
        else if (top < margin) ty += margin - top;
        if (right > size.w - margin) tx -= right - (size.w - margin);
        else if (left < margin) tx += margin - left;
        return tx === v.tx && ty === v.ty ? v : { ...v, tx, ty };
      });
    },
    [layout, size.w, usableH],
  );

  useEffect(
    () => registerHandle({ fit, focus, ensureVisible }),
    [fit, focus, ensureVisible, registerHandle],
  );

  /* ---- fit once, when the first layout with content arrives ---- */
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.w && layout.nodes.length) { fitted.current = true; fit(); }
  }, [size, layout, fit]);

  const clampK = (k: number) => Math.min(2.5, Math.max(0.08, k));

  /* ---- wheel / trackpad zoom about the cursor ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.0015));
        const s = k / v.k;
        return { k, tx: px - (px - v.tx) * s, ty: py - (py - v.ty) * s };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const startPan = (id: number, nodeId: string | null) => {
    const p = pointers.current.get(id);
    if (!p) return;
    const v = viewRef.current;
    gesture.current = { kind: 'pan', x: p.x, y: p.y, tx: v.tx, ty: v.ty, moved: false, nodeId };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const v = viewRef.current;
    const r = wrapRef.current?.getBoundingClientRect();
    gesture.current = {
      kind: 'pinch',
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      cx: (a.x + b.x) / 2 - (r?.left ?? 0),
      cy: (a.y + b.y) / 2 - (r?.top ?? 0),
      k: v.k, tx: v.tx, ty: v.ty,
    };
  };

  function onPointerDown(e: React.PointerEvent) {
    wrapRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      const nodeId = (e.target as Element).closest('[data-node]')?.getAttribute('data-node') ?? null;
      startPan(e.pointerId, nodeId);
      setDragging(true);
    } else if (pointers.current.size === 2) {
      startPinch();
      setDragging(false);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.kind === 'pan' && pointers.current.size === 1) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (g.moved) setView((v) => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }));
      return;
    }

    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      const k = clampK(g.k * (d / g.dist));
      const s = k / g.k;
      // zoom about the pinch origin, then follow the midpoint as fingers travel
      setView({
        k,
        tx: g.cx - (g.cx - g.tx) * s + (mid.x - g.cx),
        ty: g.cy - (g.cy - g.ty) * s + (mid.y - g.cy),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);

    if (g?.kind === 'pan' && !g.moved) {
      onSelect(g.nodeId);                    // a tap: select the node, or clear
    }

    if (pointers.current.size >= 2) startPinch();
    else if (pointers.current.size === 1) {
      const [id] = [...pointers.current.keys()];
      startPan(id, null);                    // pinch released to one finger
    } else {
      gesture.current = null;
      setDragging(false);
    }
  }

  const zoomBy = (f: number) =>
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.08, v.k * f));
      const s = k / v.k;
      const cx = size.w / 2, cy = usableH / 2;
      return { k, tx: cx - (cx - v.tx) * s, ty: cy - (cy - v.ty) * s };
    });

  const descentPaths = useMemo(
    () =>
      layout.descentLinks.map((d) => {
        if (!d.children.length) return null;
        const xs = d.children.map((c) => c.x);
        const left = Math.min(d.originX, ...xs);
        const right = Math.max(d.originX, ...xs);
        const solid: string[] = [];
        const dashed: string[] = [];
        solid.push(`M ${d.originX} ${d.originY} V ${d.busY}`);
        if (d.children.length > 1 || Math.abs(xs[0] - d.originX) > 0.5)
          solid.push(`M ${left} ${d.busY} H ${right}`);
        for (const c of d.children) {
          const seg = `M ${c.x} ${d.busY} V ${c.y}`;
          (c.relation === 'biological' ? solid : dashed).push(seg);
        }
        return { key: d.key, solid: solid.join(' '), dashed: dashed.join(' ') };
      }).filter(Boolean) as { key: string; solid: string; dashed: string }[],
    [layout],
  );

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg width="100%" height="100%" className={dragging ? 'grabbing' : ''}>
        <defs>
          <clipPath id="ft-card"><rect width={NODE_W} height={NODE_H} rx={11} /></clipPath>
          <clipPath id="ft-avatar"><circle cx={38} cy={NODE_H / 2} r={23} /></clipPath>
        </defs>

        <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          {/* --- descent lines --- */}
          <g fill="none" stroke="var(--line-strong)" strokeWidth={1.6} strokeLinecap="round">
            {descentPaths.map((p) => (
              <g key={p.key}>
                {p.solid && <path d={p.solid} />}
                {p.dashed && <path d={p.dashed} strokeDasharray="5 4" />}
              </g>
            ))}
          </g>

          {/* --- spouse bars --- */}
          <g strokeWidth={2} strokeLinecap="round">
            {layout.spouseLinks.map((s) => {
              const broken = s.status === 'divorced' || s.status === 'separated';
              const mid = (s.x1 + s.x2) / 2;
              return (
                <g key={s.key}>
                  <line
                    x1={s.x1} y1={s.y} x2={s.x2} y2={s.y}
                    stroke="var(--line-strong)"
                    strokeDasharray={s.status === 'unknown' ? '4 4' : undefined}
                  />
                  {broken && (
                    <>
                      <line x1={mid - 5} y1={s.y - 7} x2={mid - 1} y2={s.y + 7} stroke="var(--danger)" />
                      <line x1={mid + 1} y1={s.y - 7} x2={mid + 5} y2={s.y + 7} stroke="var(--danger)" />
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* --- people --- */}
          {layout.nodes.map((n) => {
            const p = n.person;
            const dead = !p.living;
            const dim = highlight ? !highlight.has(n.id) : false;
            const photo = p.photo_path ? photos.get(p.photo_path) : p.photo_url || undefined;
            const life = lifespan(p);
            return (
              <g
                key={n.id}
                data-node={n.id}
                className={`node${selectedId === n.id ? ' sel' : ''}${dim ? ' dim' : ''}`}
                transform={`translate(${n.x},${n.y})`}
                onDoubleClick={() => onOpen(n.id)}
              >
                <rect
                  className="body" width={NODE_W} height={NODE_H} rx={11}
                  strokeDasharray={dead ? '6 4' : undefined}
                />
                <g clipPath="url(#ft-card)">
                  <rect width={5} height={NODE_H} fill={SEX_COLOR[p.sex] ?? SEX_COLOR.u} />
                </g>

                {photo ? (
                  <image
                    href={photo} x={15} y={NODE_H / 2 - 23} width={46} height={46}
                    clipPath="url(#ft-avatar)" preserveAspectRatio="xMidYMid slice"
                    opacity={dead ? 0.72 : 1}
                  />
                ) : (
                  <>
                    <circle cx={38} cy={NODE_H / 2} r={23} fill="var(--panel-2)" stroke="var(--line)" />
                    <text
                      x={38} y={NODE_H / 2 + 5} textAnchor="middle"
                      fontSize={15} fontWeight={650} fill={SEX_COLOR[p.sex] ?? SEX_COLOR.u}
                    >
                      {initials(p)}
                    </text>
                  </>
                )}
                <circle
                  cx={38} cy={NODE_H / 2} r={23} fill="none"
                  stroke={dead ? 'var(--muted)' : 'var(--ok)'} strokeWidth={2}
                  strokeDasharray={dead ? '3 3' : undefined}
                />

                <text className="nm" x={72} y={30}>
                  {clip(fullName(p), 17)}
                  {dead && <tspan fill="var(--muted)" fontWeight={400}> †</tspan>}
                </text>
                {life && <text className="dt" x={72} y={47}>{clip(life, 22)}</text>}
                <text className="dt" x={72} y={life ? 62 : 47} fill={dead ? 'var(--muted)' : 'var(--ok)'}>
                  {dead ? 'Deceased' : 'Living'}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="zoombar">
        <button className="btn sm ghost" onClick={() => zoomBy(1 / 1.25)} title="Zoom out" aria-label="Zoom out">−</button>
        <button className="btn sm ghost" onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">+</button>
        <button className="btn sm ghost" onClick={fit} title="Fit to screen">Fit</button>
        <span className="hint" style={{ alignSelf: 'center', padding: '0 4px' }}>
          {Math.round(view.k * 100)}%
        </span>
      </div>

      <div className="legend">
        <span><i style={{ background: 'var(--m)' }} />male</span>
        <span><i style={{ background: 'var(--f)' }} />female</span>
        <span><i style={{ border: '2px solid var(--ok)', background: 'transparent', borderRadius: '50%' }} />living</span>
        <span><i style={{ border: '2px dashed var(--muted)', background: 'transparent', borderRadius: '50%' }} />deceased</span>
      </div>
    </div>
  );
}
