import type { Graph, Person, Union } from './types';

/* ------------------------------------------------------------------ *
 * Geometry constants
 * ------------------------------------------------------------------ */
export const NODE_W = 196;
export const NODE_H = 78;
export const SPOUSE_GAP = 30;   // between two partners in a couple
export const SIB_GAP = 26;      // between sibling sub-blocks
export const FU_GAP = 56;       // between two family units of the same cluster
export const LEVEL_GAP = 104;   // vertical space between generations
export const ROOT_GAP = 90;     // between separate root families
export const PAD = 80;

/* ------------------------------------------------------------------ *
 * Output shapes
 * ------------------------------------------------------------------ */
export type PosNode = {
  id: string;
  person: Person;
  x: number;         // left
  y: number;         // top
  gen: number;
};

export type SpouseLink = {
  key: string;
  union: Union | null;
  x1: number; x2: number; y: number;   // horizontal bar between the two boxes
  status: string;
};

export type DescentLink = {
  key: string;
  /** x of the vertical drop from the parents */
  originX: number;
  /** y at the bottom of the parent row */
  originY: number;
  /** y of the horizontal sibling bus */
  busY: number;
  children: { id: string; x: number; y: number; relation: string }[];
};

export type LayoutResult = {
  nodes: PosNode[];
  byId: Map<string, PosNode>;
  spouseLinks: SpouseLink[];
  descentLinks: DescentLink[];
  width: number;
  height: number;
  minX: number;
  minY: number;
  generations: number;
  orphans: string[];   // people not connected to anyone
};

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */
export type Index = {
  persons: Map<string, Person>;
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  unionsOf: Map<string, Union[]>;
  relationOf: Map<string, string>;       // `${parent}|${child}` -> relation
  unionBetween: Map<string, Union>;      // sorted pair key -> union
  order: Map<string, number>;            // stable person ordering
};

const pairKey = (a: string | null, b: string | null) =>
  [a ?? '', b ?? ''].sort().join('|');

export function buildIndex(g: Graph): Index {
  const persons = new Map(g.persons.map((p) => [p.id, p]));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const unionsOf = new Map<string, Union[]>();
  const relationOf = new Map<string, string>();
  const unionBetween = new Map<string, Union>();
  const order = new Map<string, number>();

  const sorted = [...g.persons].sort((a, b) => {
    const ab = birthKey(a), bb = birthKey(b);
    if (ab !== bb) return ab - bb;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
  sorted.forEach((p, i) => order.set(p.id, i));

  for (const e of g.edges) {
    if (!persons.has(e.parent_id) || !persons.has(e.child_id)) continue;
    (parentsOf.get(e.child_id) ?? parentsOf.set(e.child_id, []).get(e.child_id)!).push(e.parent_id);
    (childrenOf.get(e.parent_id) ?? childrenOf.set(e.parent_id, []).get(e.parent_id)!).push(e.child_id);
    relationOf.set(`${e.parent_id}|${e.child_id}`, e.relation);
  }
  for (const u of g.unions) {
    for (const side of [u.partner_a, u.partner_b]) {
      if (!side || !persons.has(side)) continue;
      (unionsOf.get(side) ?? unionsOf.set(side, []).get(side)!).push(u);
    }
    if (u.partner_a && u.partner_b) unionBetween.set(pairKey(u.partner_a, u.partner_b), u);
  }
  // deterministic child ordering: by birth, then insertion
  for (const [k, v] of childrenOf) {
    v.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    childrenOf.set(k, [...new Set(v)]);
  }
  for (const [k, v] of parentsOf) parentsOf.set(k, [...new Set(v)]);

  return { persons, parentsOf, childrenOf, unionsOf, relationOf, unionBetween, order };
}

/** Pull the first 3-4 digit run out of a free-text date so "c. 1942" sorts. */
function birthKey(p: Person): number {
  const m = (p.birth_date ?? '').match(/\d{3,4}/);
  return m ? parseInt(m[0], 10) : 9999;
}

/* ------------------------------------------------------------------ *
 * 1. Generation assignment
 *    Longest path from the roots, then a fixpoint that keeps spouses on
 *    the same row without ever letting a child sit above a parent.
 * ------------------------------------------------------------------ */
export function assignGenerations(ix: Index, g: Graph): Map<string, number> {
  const gen = new Map<string, number>();
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done

  const depth = (id: string): number => {
    const st = state.get(id);
    if (st === 2) return gen.get(id)!;
    if (st === 1) return 0;               // cycle guard (bad data): treat as root
    state.set(id, 1);
    const parents = ix.parentsOf.get(id) ?? [];
    let d = 0;
    for (const p of parents) d = Math.max(d, depth(p) + 1);
    state.set(id, 2);
    gen.set(id, d);
    return d;
  };
  for (const p of g.persons) depth(p.id);

  // Fixpoint: level spouses, then push children back down.
  const maxRounds = Math.min(60, g.persons.length + 5);
  for (let round = 0; round < maxRounds; round++) {
    let changed = false;

    for (const u of g.unions) {
      const a = u.partner_a, b = u.partner_b;
      if (!a || !b || !gen.has(a) || !gen.has(b)) continue;
      const m = Math.max(gen.get(a)!, gen.get(b)!);
      if (gen.get(a)! !== m) { gen.set(a, m); changed = true; }
      if (gen.get(b)! !== m) { gen.set(b, m); changed = true; }
    }

    for (const e of g.edges) {
      const gp = gen.get(e.parent_id), gc = gen.get(e.child_id);
      if (gp === undefined || gc === undefined) continue;
      if (gc <= gp) { gen.set(e.child_id, gp + 1); changed = true; }
    }

    if (!changed) break;
  }
  return gen;
}

/* ------------------------------------------------------------------ *
 * 2. Clusters — a person plus everyone they are partnered with,
 *    laid out as one horizontal run. Handles remarriage (B–A–C).
 * ------------------------------------------------------------------ */
type Cluster = { id: string; members: string[]; gen: number };

function buildClusters(ix: Index, g: Graph, gen: Map<string, number>): {
  clusters: Cluster[];
  clusterOf: Map<string, Cluster>;
} {
  const seen = new Set<string>();
  const clusters: Cluster[] = [];
  const clusterOf = new Map<string, Cluster>();

  for (const p of [...g.persons].sort((a, b) => (ix.order.get(a.id)! - ix.order.get(b.id)!))) {
    if (seen.has(p.id)) continue;

    // collect the connected component over union edges
    const comp: string[] = [];
    const stack = [p.id];
    seen.add(p.id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const u of ix.unionsOf.get(cur) ?? []) {
        for (const side of [u.partner_a, u.partner_b]) {
          if (side && !seen.has(side) && ix.persons.has(side)) { seen.add(side); stack.push(side); }
        }
      }
    }

    const members = comp.length <= 1 ? comp : orderRun(comp, ix);
    const c: Cluster = {
      id: members[0],
      members,
      gen: Math.max(...members.map((m) => gen.get(m) ?? 0)),
    };
    clusters.push(c);
    members.forEach((m) => clusterOf.set(m, c));
  }
  return { clusters, clusterOf };
}

/** Greedy path through the partner graph so each spouse sits next to their partner. */
function orderRun(comp: string[], ix: Index): string[] {
  const adj = new Map<string, Set<string>>();
  comp.forEach((c) => adj.set(c, new Set()));
  for (const c of comp) {
    for (const u of ix.unionsOf.get(c) ?? []) {
      const other = u.partner_a === c ? u.partner_b : u.partner_a;
      if (other && adj.has(other)) { adj.get(c)!.add(other); adj.get(other)!.add(c); }
    }
  }
  // start from the least-connected node so a hub ends up in the middle
  const start = [...comp].sort(
    (a, b) => (adj.get(a)!.size - adj.get(b)!.size) || (ix.order.get(a)! - ix.order.get(b)!),
  )[0];

  const out: string[] = [];
  const used = new Set<string>();
  let cur: string | undefined = start;
  while (cur) {
    out.push(cur); used.add(cur);
    const next: string | undefined = [...adj.get(cur)!]
      .filter((n) => !used.has(n))
      .sort((a, b) => (adj.get(a)!.size - adj.get(b)!.size) || (ix.order.get(a)! - ix.order.get(b)!))[0];
    cur = next;
  }
  // anything the greedy walk missed (rare: 3+ way hub) is appended
  for (const c of comp) if (!used.has(c)) out.push(c);
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. Family units owned by a cluster
 * ------------------------------------------------------------------ */
type FamilyUnit = {
  key: string;
  parents: string[];          // 1 or 2, in cluster order
  union: Union | null;
  children: string[];
};

function unitsOfCluster(c: Cluster, ix: Index): FamilyUnit[] {
  const units: FamilyUnit[] = [];
  const claimed = new Set<string>();

  // couples: adjacent pairs first (keeps drop-lines short), then any others
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < c.members.length; i++) pairs.push([c.members[i], c.members[i + 1]]);
  for (const a of c.members) {
    for (const u of ix.unionsOf.get(a) ?? []) {
      const b = u.partner_a === a ? u.partner_b : u.partner_a;
      if (!b || !c.members.includes(b)) continue;
      if (!pairs.some((p) => pairKey(p[0], p[1]) === pairKey(a, b))) pairs.push([a, b]);
    }
  }

  for (const [a, b] of pairs) {
    const u = ix.unionBetween.get(pairKey(a, b)) ?? null;
    const kids = (ix.childrenOf.get(a) ?? []).filter((k) => {
      const ps = ix.parentsOf.get(k) ?? [];
      return ps.length === 2 && ps.includes(a) && ps.includes(b);
    });
    if (!u && kids.length === 0) continue;
    const key = pairKey(a, b);
    if (units.some((x) => x.key === key)) continue;
    kids.forEach((k) => claimed.add(k));
    units.push({ key, parents: [a, b], union: u, children: kids });
  }

  // single-parent units: children whose only recorded parent is this member
  for (const m of c.members) {
    const kids = (ix.childrenOf.get(m) ?? []).filter((k) => {
      if (claimed.has(k)) return false;
      const ps = ix.parentsOf.get(k) ?? [];
      return ps.length === 1 && ps[0] === m;
    });
    if (kids.length) units.push({ key: `solo:${m}`, parents: [m], union: null, children: kids });
  }

  // leftovers: children with 2+ parents where the co-parent is outside this
  // cluster (bad data, or a parent linked without a union). Attach to the
  // first parent we find so nobody silently disappears from the tree.
  for (const m of c.members) {
    const kids = (ix.childrenOf.get(m) ?? []).filter(
      (k) => !claimed.has(k) && !units.some((u) => u.children.includes(k)),
    );
    if (!kids.length) continue;
    const existing = units.find((u) => u.parents.length === 1 && u.parents[0] === m);
    if (existing) existing.children.push(...kids);
    else units.push({ key: `solo:${m}`, parents: [m], union: null, children: kids });
    kids.forEach((k) => claimed.add(k));
  }

  return units;
}

/* ------------------------------------------------------------------ *
 * 4. Recursive block layout
 * ------------------------------------------------------------------ */
export function layoutGraph(g: Graph): LayoutResult {
  const ix = buildIndex(g);
  const gen = assignGenerations(ix, g);
  const { clusters, clusterOf } = buildClusters(ix, g, gen);

  const placed = new Set<string>();       // cluster ids
  const nodeX = new Map<string, number>();
  const descentLinks: DescentLink[] = [];

  type Block = { width: number; apply: (x: number) => void };

  const layoutCluster = (c: Cluster): Block | null => {
    if (placed.has(c.id)) return null;
    placed.add(c.id);

    const units = unitsOfCluster(c, ix);

    // lay out each unit's children first (post-order), so widths are known
    const unitBlocks = units.map((u) => {
      const childClusters: Cluster[] = [];
      for (const kid of u.children) {
        const cc = clusterOf.get(kid);
        if (cc && !childClusters.includes(cc)) childClusters.push(cc);
      }
      childClusters.sort((a, b) => {
        const ka = Math.min(...a.members.map((m) => ix.order.get(m) ?? 0));
        const kb = Math.min(...b.members.map((m) => ix.order.get(m) ?? 0));
        return ka - kb;
      });
      const blocks = childClusters
        .map((cc) => layoutCluster(cc))
        .filter((b): b is Block => b !== null);
      const width =
        blocks.length === 0
          ? 0
          : blocks.reduce((s, b) => s + b.width, 0) + SIB_GAP * (blocks.length - 1);
      return { unit: u, blocks, width };
    });

    const childrenTotal = (() => {
      const withKids = unitBlocks.filter((ub) => ub.width > 0);
      if (!withKids.length) return 0;
      return withKids.reduce((s, ub) => s + ub.width, 0) + FU_GAP * (withKids.length - 1);
    })();

    const ownWidth = c.members.length * NODE_W + SPOUSE_GAP * (c.members.length - 1);
    const width = Math.max(ownWidth, childrenTotal);

    const apply = (left: number) => {
      // centre the couple(s) over the children block
      let mx = left + (width - ownWidth) / 2;
      for (const m of c.members) {
        nodeX.set(m, mx);
        mx += NODE_W + SPOUSE_GAP;
      }

      let cx = left + (width - childrenTotal) / 2;
      for (const ub of unitBlocks) {
        if (ub.width === 0) continue;
        let bx = cx;
        for (const b of ub.blocks) { b.apply(bx); bx += b.width + SIB_GAP; }

        const parentXs = ub.unit.parents
          .map((p) => nodeX.get(p))
          .filter((v): v is number => v !== undefined)
          .map((v) => v + NODE_W / 2);
        const originX = parentXs.length
          ? parentXs.reduce((s, v) => s + v, 0) / parentXs.length
          : cx + ub.width / 2;

        const originY = c.gen * (NODE_H + LEVEL_GAP) + NODE_H;
        const busY = originY + LEVEL_GAP / 2;

        descentLinks.push({
          key: `${c.id}:${ub.unit.key}`,
          originX,
          originY,
          busY,
          children: ub.unit.children
            .map((kid) => {
              const x = nodeX.get(kid);
              if (x === undefined) return null;
              const kg = gen.get(kid) ?? c.gen + 1;
              return {
                id: kid,
                x: x + NODE_W / 2,
                y: kg * (NODE_H + LEVEL_GAP),
                relation: ix.relationOf.get(`${ub.unit.parents[0]}|${kid}`) ?? 'biological',
              };
            })
            .filter((v): v is { id: string; x: number; y: number; relation: string } => v !== null),
        });

        cx += ub.width + FU_GAP;
      }
    };

    return { width, apply };
  };

  /* ---- pick roots: shallowest generation first, loners last ---- */
  const hasDescendants = (c: Cluster) =>
    c.members.some((m) => (ix.childrenOf.get(m) ?? []).length > 0);
  const isRoot = (c: Cluster) =>
    c.members.every((m) => (ix.parentsOf.get(m) ?? []).length === 0);

  const rootCandidates = clusters
    .filter(isRoot)
    .sort((a, b) => {
      const la = hasDescendants(a) ? 0 : 1, lb = hasDescendants(b) ? 0 : 1;
      if (la !== lb) return la - lb;
      if (a.gen !== b.gen) return a.gen - b.gen;
      return (ix.order.get(a.members[0]) ?? 0) - (ix.order.get(b.members[0]) ?? 0);
    });

  let cursor = 0;
  for (const c of rootCandidates) {
    const b = layoutCluster(c);
    if (!b) continue;
    b.apply(cursor);
    cursor += b.width + ROOT_GAP;
  }
  // anything unreachable (a cycle in the data, or a married-in branch whose
  // own ancestors form a closed loop) still gets drawn
  for (const c of clusters.sort((a, b) => a.gen - b.gen)) {
    const b = layoutCluster(c);
    if (!b) continue;
    b.apply(cursor);
    cursor += b.width + ROOT_GAP;
  }

  /* ---- materialise nodes ---- */
  const nodes: PosNode[] = [];
  for (const p of g.persons) {
    const x = nodeX.get(p.id);
    if (x === undefined) continue;
    nodes.push({ id: p.id, person: p, x, y: (gen.get(p.id) ?? 0) * (NODE_H + LEVEL_GAP), gen: gen.get(p.id) ?? 0 });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  /* ---- spouse bars ---- */
  const spouseLinks: SpouseLink[] = [];
  for (const u of g.unions) {
    const a = u.partner_a ? byId.get(u.partner_a) : undefined;
    const b = u.partner_b ? byId.get(u.partner_b) : undefined;
    if (!a || !b) continue;
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    spouseLinks.push({
      key: u.id,
      union: u,
      x1: l.x + NODE_W,
      x2: r.x,
      y: Math.max(l.y, r.y) + NODE_H / 2,
      status: u.status,
    });
  }

  const orphans = g.persons
    .filter(
      (p) =>
        (ix.parentsOf.get(p.id) ?? []).length === 0 &&
        (ix.childrenOf.get(p.id) ?? []).length === 0 &&
        (ix.unionsOf.get(p.id) ?? []).length === 0,
    )
    .map((p) => p.id);

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = xs.length ? Math.min(...xs) - PAD : 0;
  const minY = ys.length ? Math.min(...ys) - PAD : 0;
  const maxX = xs.length ? Math.max(...xs) + NODE_W + PAD : 100;
  const maxY = ys.length ? Math.max(...ys) + NODE_H + PAD : 100;

  return {
    nodes,
    byId,
    spouseLinks,
    descentLinks,
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    generations: nodes.length ? Math.max(...nodes.map((n) => n.gen)) + 1 : 0,
    orphans,
  };
}
