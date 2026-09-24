export type Role = 'admin' | 'editor' | 'viewer';
export type Sex = 'm' | 'f' | 'o' | 'u';
export type Relation = 'biological' | 'adopted' | 'step' | 'foster' | 'guardian';
export type UnionKind = 'marriage' | 'partnership' | 'other';
export type UnionStatus = 'current' | 'divorced' | 'separated' | 'widowed' | 'unknown';

export type Person = {
  id: string;
  tree_id: string;
  given_name: string;
  family_name: string;
  nickname: string | null;
  sex: Sex;
  birth_date: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_place: string | null;
  living: boolean;
  occupation: string | null;
  notes: string | null;
  photo_url: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Union = {
  id: string;
  tree_id: string;
  partner_a: string | null;
  partner_b: string | null;
  kind: UnionKind;
  status: UnionStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

export type ParentChild = {
  id: string;
  tree_id: string;
  parent_id: string;
  child_id: string;
  relation: Relation;
};

export type Tree = { id: string; name: string; owner_id: string; created_at: string };

export type Member = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: Role;
  added_at: string;
  is_owner: boolean;
};

export type Invite = {
  id: string;
  tree_id: string;
  code: string;
  role: 'editor' | 'viewer';
  label: string | null;
  expires_at: string | null;
  max_uses: number;
  uses: number;
  revoked: boolean;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  at: string;
};

export type Graph = { persons: Person[]; unions: Union[]; edges: ParentChild[] };

export function fullName(p: Person): string {
  const n = `${p.given_name ?? ''} ${p.family_name ?? ''}`.trim();
  return n || 'Unnamed';
}

export function lifespan(p: Person): string {
  const b = p.birth_date?.trim();
  const d = p.death_date?.trim();
  if (b && d) return `${b} – ${d}`;
  if (b) return p.living ? `b. ${b}` : `${b} – ?`;
  if (d) return `d. ${d}`;
  return p.living ? '' : 'deceased';
}
