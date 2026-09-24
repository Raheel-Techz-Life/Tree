import { layoutGraph, NODE_H, NODE_W } from '../src/lib/layout';
import type { Graph, Person, Union, ParentChild } from '../src/lib/types';

let n = 0;
const persons: Person[] = [];
const unions: Union[] = [];
const edges: ParentChild[] = [];
const T = 'tree';

function P(given: string, family = 'Hosmani', opts: Partial<Person> = {}): string {
  const id = `p${++n}`;
  persons.push({
    id, tree_id: T, given_name: given, family_name: family, nickname: null,
    sex: 'u', birth_date: opts.birth_date ?? null, birth_place: null,
    death_date: null, death_place: null, living: true, occupation: null,
    notes: null, photo_url: null, photo_path: null, created_by: null,
    created_at: String(n).padStart(4, '0'), updated_at: '', ...opts,
  } as Person);
  return id;
}
function M(a: string, b: string, status: Union['status'] = 'current') {
  unions.push({ id: `u${unions.length}`, tree_id: T, partner_a: a, partner_b: b,
    kind: 'marriage', status, start_date: null, end_date: null, notes: null });
}
function kid(child: string, ...parents: string[]) {
  for (const p of parents) edges.push({ id: `e${edges.length}`, tree_id: T, parent_id: p, child_id: child, relation: 'biological' });
}

/* ---- the scenario: great-grandparents -> grandfather + 2 sisters ---- */
const ggf = P('Ibrahim', 'Hosmani', { sex: 'm', living: false, birth_date: '1890' });
const ggm = P('Fatima', 'Hosmani', { sex: 'f', living: false, birth_date: '1895' });
M(ggf, ggm, 'widowed');

const gf = P('Abdul', 'Hosmani', { sex: 'm', living: false, birth_date: '1920' });
const sis1 = P('Zainab', 'Hosmani', { sex: 'f', living: false, birth_date: '1922' });
const sis2 = P('Ayesha', 'Hosmani', { sex: 'f', living: false, birth_date: '1925' });
[gf, sis1, sis2].forEach((c) => kid(c, ggf, ggm));

const gm = P('Salma', 'Hosmani', { sex: 'f', birth_date: '1928' });
M(gf, gm);

/* sisters married out, each with children */
const h1 = P('Yusuf', 'Shaikh', { sex: 'm', living: false }); M(sis1, h1);
const h2 = P('Rashid', 'Patel', { sex: 'm' }); M(sis2, h2);
kid(P('Nadia', 'Shaikh', { sex: 'f', birth_date: '1950' }), sis1, h1);
kid(P('Omar', 'Shaikh', { sex: 'm', birth_date: '1953' }), sis1, h1);
kid(P('Sana', 'Patel', { sex: 'f', birth_date: '1955' }), sis2, h2);

/* grandfather's five sons, each with a spouse and kids */
const sons: string[] = [];
['Kareem', 'Nasir', 'Imran', 'Faisal', 'Tariq'].forEach((nm, i) => {
  const s = P(nm, 'Hosmani', { sex: 'm', birth_date: String(1950 + i * 2) });
  kid(s, gf, gm);
  sons.push(s);
  const w = P(['Rehana', 'Shabana', 'Nuzhat', 'Farida', 'Saira'][i], 'Hosmani', { sex: 'f' });
  M(s, w);
  const count = [3, 2, 4, 1, 2][i];
  for (let k = 0; k < count; k++) {
    kid(P(`${nm[0]}child${k + 1}`, 'Hosmani', { sex: k % 2 ? 'f' : 'm', birth_date: String(1980 + k) }), s, w);
  }
});

/* a daughter too, married out, with a child -> great-grandchildren depth */
const dau = P('Rubina', 'Hosmani', { sex: 'f', birth_date: '1962' });
kid(dau, gf, gm);
const dh = P('Sajid', 'Kazi', { sex: 'm' });
M(dau, dh);
kid(P('Ali', 'Kazi', { sex: 'm', birth_date: '1990' }), dau, dh);

/* remarriage: eldest son divorced and remarried, child from 2nd marriage */
const ex = P('Tabassum', 'Hosmani', { sex: 'f' });
unions[unions.findIndex((u) => u.partner_a === sons[0])].status = 'divorced';
M(sons[0], ex);
kid(P('Kchild4', 'Hosmani', { sex: 'f', birth_date: '1995' }), sons[0], ex);

/* an adopted child */
const adopted = P('Zara', 'Hosmani', { sex: 'f', birth_date: '1988' });
edges.push({ id: 'eA1', tree_id: T, parent_id: sons[2], child_id: adopted, relation: 'adopted' });
edges.push({ id: 'eA2', tree_id: T, parent_id: unions.find((u) => u.partner_a === sons[2])!.partner_b!, child_id: adopted, relation: 'adopted' });

/* a floating person nobody linked yet */
P('Unlinked', 'Person');

const g: Graph = { persons, unions, edges };
const L = layoutGraph(g);

/* ------------------------- assertions ------------------------- */
let fails = 0;
const fail = (m: string) => { console.log('  FAIL ' + m); fails++; };

if (L.nodes.length !== persons.length) fail(`only ${L.nodes.length}/${persons.length} people placed`);

// 1. no overlapping boxes
for (let i = 0; i < L.nodes.length; i++) {
  for (let j = i + 1; j < L.nodes.length; j++) {
    const a = L.nodes[i], b = L.nodes[j];
    if (Math.abs(a.x - b.x) < NODE_W - 1 && Math.abs(a.y - b.y) < NODE_H - 1) {
      fail(`overlap: ${a.person.given_name} and ${b.person.given_name}`);
    }
  }
}

// 2. every child strictly below every parent
for (const e of edges) {
  const p = L.byId.get(e.parent_id), c = L.byId.get(e.child_id);
  if (!p || !c) { fail('missing node for an edge'); continue; }
  if (c.y <= p.y) fail(`${c.person.given_name} is not below parent ${p.person.given_name}`);
}

// 3. spouses on the same row
for (const u of unions) {
  const a = L.byId.get(u.partner_a!), b = L.byId.get(u.partner_b!);
  if (a && b && a.y !== b.y) fail(`spouses on different rows: ${a.person.given_name}/${b.person.given_name}`);
}

// 4. sibling groups do not interleave with other families
for (const d of L.descentLinks) {
  if (d.children.length < 2) continue;
  const xs = d.children.map((c) => c.x).sort((p, q) => p - q);
  const lo = xs[0], hi = xs[xs.length - 1];
  const ids = new Set(d.children.map((c) => c.id));
  const intruders = L.nodes.filter(
    (nd) => !ids.has(nd.id) &&
      nd.y === L.byId.get(d.children[0].id)!.y &&
      nd.x + NODE_W / 2 > lo && nd.x + NODE_W / 2 < hi &&
      // a spouse married into the group is expected
      !unions.some((u) =>
        (ids.has(u.partner_a!) && u.partner_b === nd.id) || (ids.has(u.partner_b!) && u.partner_a === nd.id)),
  );
  if (intruders.length) fail(`sibling group split by ${intruders.map((i) => i.person.given_name).join(', ')}`);
}

console.log(`people=${persons.length} unions=${unions.length} edges=${edges.length}`);
console.log(`placed=${L.nodes.length} generations=${L.generations} canvas=${Math.round(L.width)}x${Math.round(L.height)}`);
console.log(fails === 0 ? 'ALL LAYOUT CHECKS PASSED' : `${fails} FAILURES`);

/* ---------------------- render a preview ---------------------- */
const SEX: Record<string, string> = { m: '#3d7fd6', f: '#c0569a', o: '#7a5cc4', u: '#8a939d' };
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
const parts: string[] = [];
for (const d of L.descentLinks) {
  if (!d.children.length) continue;
  const xs = d.children.map((c) => c.x);
  parts.push(`<path d="M ${d.originX} ${d.originY} V ${d.busY}" stroke="#c9d0d8" fill="none" stroke-width="1.6"/>`);
  parts.push(`<path d="M ${Math.min(d.originX, ...xs)} ${d.busY} H ${Math.max(d.originX, ...xs)}" stroke="#c9d0d8" fill="none" stroke-width="1.6"/>`);
  for (const c of d.children) {
    parts.push(`<path d="M ${c.x} ${d.busY} V ${c.y}" stroke="#c9d0d8" fill="none" stroke-width="1.6"${c.relation !== 'biological' ? ' stroke-dasharray="5 4"' : ''}/>`);
  }
}
for (const s of L.spouseLinks) {
  parts.push(`<line x1="${s.x1}" y1="${s.y}" x2="${s.x2}" y2="${s.y}" stroke="${s.status === 'divorced' ? '#c0392b' : '#c9d0d8'}" stroke-width="2"/>`);
}
for (const nd of L.nodes) {
  const p = nd.person;
  parts.push(
    `<g transform="translate(${nd.x},${nd.y})">` +
    `<rect width="${NODE_W}" height="${NODE_H}" rx="11" fill="#fff" stroke="#c9d0d8"${p.living ? '' : ' stroke-dasharray="6 4"'}/>` +
    `<rect width="5" height="${NODE_H}" fill="${SEX[p.sex]}"/>` +
    `<circle cx="38" cy="39" r="23" fill="#fbfcfd" stroke="${p.living ? '#1e8e5a' : '#8a939d'}" stroke-width="2"${p.living ? '' : ' stroke-dasharray="3 3"'}/>` +
    `<text x="38" y="44" text-anchor="middle" font-size="14" font-weight="650" fill="${SEX[p.sex]}" font-family="sans-serif">${esc((p.given_name[0] ?? '') + (p.family_name[0] ?? ''))}</text>` +
    `<text x="72" y="30" font-size="13" font-weight="650" font-family="sans-serif">${esc(p.given_name)}${p.living ? '' : ' †'}</text>` +
    `<text x="72" y="47" font-size="11" fill="#6b7784" font-family="sans-serif">${esc(p.family_name)}</text>` +
    `<text x="72" y="62" font-size="11" fill="${p.living ? '#1e8e5a' : '#8a939d'}" font-family="sans-serif">${p.living ? 'Living' : 'Deceased'}</text>` +
    `</g>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${L.minX} ${L.minY} ${L.width} ${L.height}" width="${Math.round(L.width)}" height="${Math.round(L.height)}"><rect x="${L.minX}" y="${L.minY}" width="${L.width}" height="${L.height}" fill="#f6f7f9"/>${parts.join('')}</svg>`;
require('fs').writeFileSync(process.argv[2] ?? '/tmp/tree.svg', svg);
console.log('preview written');
process.exit(fails === 0 ? 0 : 1);
