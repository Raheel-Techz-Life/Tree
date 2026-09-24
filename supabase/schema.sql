-- =====================================================================
-- FAMILY TREE — full schema, RLS, RPCs, audit log, realtime
-- Run this ONCE in your Supabase project: SQL Editor -> New query -> Run
-- Safe to re-run: everything is idempotent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- TREES + MEMBERSHIP
-- ---------------------------------------------------------------------
create table if not exists public.trees (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tree_members (
  tree_id  uuid not null references public.trees(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null check (role in ('admin','editor','viewer')),
  added_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);
create index if not exists tree_members_user_idx on public.tree_members(user_id);

-- ---------------------------------------------------------------------
-- INVITES
-- ---------------------------------------------------------------------
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references public.trees(id) on delete cascade,
  code       text not null unique,
  role       text not null check (role in ('editor','viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  label      text,
  expires_at timestamptz,
  max_uses   int not null default 25,
  uses       int not null default 0,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists invites_tree_idx on public.invites(tree_id);

-- ---------------------------------------------------------------------
-- PEOPLE
-- Dates are TEXT on purpose: real genealogy data is "1942", "c. 1950",
-- "Mar 1911". Forcing a DATE column loses information you cannot recover.
-- ---------------------------------------------------------------------
create table if not exists public.persons (
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references public.trees(id) on delete cascade,
  given_name  text not null default '',
  family_name text not null default '',
  nickname    text,
  sex         text not null default 'u' check (sex in ('m','f','o','u')),
  birth_date  text,
  birth_place text,
  death_date  text,
  death_place text,
  living      boolean not null default true,
  occupation  text,
  notes       text,
  photo_url   text,          -- optional external link
  photo_path  text,          -- object path inside the 'photos' storage bucket
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists persons_tree_idx on public.persons(tree_id);
alter table public.persons add column if not exists photo_path text;

-- ---------------------------------------------------------------------
-- UNIONS (marriage / partnership). Either partner may be null (unknown).
-- ---------------------------------------------------------------------
create table if not exists public.unions (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references public.trees(id) on delete cascade,
  partner_a  uuid references public.persons(id) on delete cascade,
  partner_b  uuid references public.persons(id) on delete cascade,
  kind       text not null default 'marriage'
             check (kind in ('marriage','partnership','other')),
  status     text not null default 'current'
             check (status in ('current','divorced','separated','widowed','unknown')),
  start_date text,
  end_date   text,
  notes      text,
  created_at timestamptz not null default now(),
  check (partner_a is not null or partner_b is not null),
  check (partner_a is distinct from partner_b)
);
create index if not exists unions_tree_idx on public.unions(tree_id);
create index if not exists unions_a_idx on public.unions(partner_a);
create index if not exists unions_b_idx on public.unions(partner_b);

-- ---------------------------------------------------------------------
-- PARENT -> CHILD edges.
-- One row per (parent, child). A child with two known parents has two
-- rows. A child with one known parent has one. This is what makes the
-- structure a DAG rather than a strict tree, and it is why adoption,
-- step-parents and unknown spouses all fit without special cases.
-- ---------------------------------------------------------------------
create table if not exists public.parent_child (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references public.trees(id) on delete cascade,
  parent_id  uuid not null references public.persons(id) on delete cascade,
  child_id   uuid not null references public.persons(id) on delete cascade,
  relation   text not null default 'biological'
             check (relation in ('biological','adopted','step','foster','guardian')),
  created_at timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);
create index if not exists pc_tree_idx on public.parent_child(tree_id);
create index if not exists pc_child_idx on public.parent_child(child_id);
create index if not exists pc_parent_idx on public.parent_child(parent_id);

-- ---------------------------------------------------------------------
-- AUDIT LOG — who changed what, when.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  tree_id     uuid not null references public.trees(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  summary     text,
  payload     jsonb,
  at          timestamptz not null default now()
);
create index if not exists audit_tree_idx on public.audit_log(tree_id, at desc);

-- =====================================================================
-- HELPERS (security definer -> avoids RLS recursion on tree_members)
-- =====================================================================
create or replace function public.tree_role(t uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.tree_members
   where tree_id = t and user_id = auth.uid()
$$;

create or replace function public.is_member(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tree_members
                  where tree_id = t and user_id = auth.uid())
$$;

create or replace function public.can_edit(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tree_members
                  where tree_id = t and user_id = auth.uid()
                    and role in ('admin','editor'))
$$;

create or replace function public.is_admin(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tree_members
                  where tree_id = t and user_id = auth.uid() and role = 'admin')
$$;

-- =====================================================================
-- AUDIT TRIGGER
-- =====================================================================
create or replace function public.audit_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec       jsonb;
  t         uuid;
  label     text;
begin
  if (tg_op = 'DELETE') then rec := to_jsonb(old); t := old.tree_id;
  else                       rec := to_jsonb(new); t := new.tree_id;
  end if;

  if tg_table_name = 'persons' then
    label := trim(coalesce(rec->>'given_name','') || ' ' || coalesce(rec->>'family_name',''));
  else
    label := tg_table_name;
  end if;

  insert into public.audit_log (tree_id, actor_id, action, entity, entity_id, summary, payload)
  values (t, auth.uid(), lower(tg_op), tg_table_name, (rec->>'id')::uuid, nullif(label,''), rec);

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists persons_audit on public.persons;
create trigger persons_audit after insert or update or delete on public.persons
  for each row execute function public.audit_change();

drop trigger if exists persons_touch on public.persons;
create trigger persons_touch before update on public.persons
  for each row execute function public.touch_updated_at();

drop trigger if exists unions_audit on public.unions;
create trigger unions_audit after insert or update or delete on public.unions
  for each row execute function public.audit_change();

drop trigger if exists pc_audit on public.parent_child;
create trigger pc_audit after insert or update or delete on public.parent_child
  for each row execute function public.audit_change();

-- =====================================================================
-- RPCs
-- =====================================================================

-- Create a tree and make the caller its admin, atomically.
create or replace function public.create_tree(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.trees (name, owner_id) values (coalesce(nullif(trim(p_name),''),'Our Family'), auth.uid())
    returning id into new_id;
  insert into public.tree_members (tree_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return new_id;
end $$;

-- Admin creates an invite code.
create or replace function public.create_invite(
  p_tree_id uuid, p_role text default 'editor',
  p_label text default null, p_days int default 30, p_max_uses int default 25)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_admin(p_tree_id) then raise exception 'only an admin can create invites'; end if;
  if p_role not in ('editor','viewer') then raise exception 'role must be editor or viewer'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (tree_id, code, role, created_by, label, expires_at, max_uses)
  values (p_tree_id, v_code, p_role, auth.uid(), nullif(trim(coalesce(p_label,'')),''),
          case when p_days is null or p_days <= 0 then null else now() + (p_days || ' days')::interval end,
          greatest(coalesce(p_max_uses,25), 1));
  return v_code;
end $$;

-- Anyone signed in redeems a code. Returns the tree id.
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from public.invites where code = upper(trim(p_code));
  if not found then raise exception 'invite code not found'; end if;
  if inv.revoked then raise exception 'this invite has been revoked'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception 'this invite has expired'; end if;
  if inv.uses >= inv.max_uses then raise exception 'this invite has been used up'; end if;

  if exists (select 1 from public.tree_members where tree_id = inv.tree_id and user_id = auth.uid()) then
    return inv.tree_id;  -- already a member, no-op
  end if;

  insert into public.tree_members (tree_id, user_id, role) values (inv.tree_id, auth.uid(), inv.role);
  update public.invites set uses = uses + 1 where id = inv.id;
  insert into public.audit_log (tree_id, actor_id, action, entity, summary)
    values (inv.tree_id, auth.uid(), 'join', 'tree_members', 'joined as ' || inv.role);
  return inv.tree_id;
end $$;

-- Admin changes someone's role. Cannot demote the tree owner.
create or replace function public.set_member_role(p_tree_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_tree_id) then raise exception 'only an admin can change roles'; end if;
  if p_role not in ('admin','editor','viewer') then raise exception 'bad role'; end if;
  if exists (select 1 from public.trees where id = p_tree_id and owner_id = p_user_id) and p_role <> 'admin' then
    raise exception 'the tree owner must stay an admin';
  end if;
  update public.tree_members set role = p_role where tree_id = p_tree_id and user_id = p_user_id;
end $$;

-- Admin removes a member. Cannot remove the owner.
create or replace function public.remove_member(p_tree_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_tree_id) then raise exception 'only an admin can remove members'; end if;
  if exists (select 1 from public.trees where id = p_tree_id and owner_id = p_user_id) then
    raise exception 'the tree owner cannot be removed';
  end if;
  delete from public.tree_members where tree_id = p_tree_id and user_id = p_user_id;
end $$;

-- Members list with emails (profiles are otherwise not readable across users).
create or replace function public.list_members(p_tree_id uuid)
returns table (user_id uuid, email text, display_name text, role text, added_at timestamptz, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.email, p.display_name, m.role, m.added_at, (t.owner_id = m.user_id)
    from public.tree_members m
    join public.trees t on t.id = m.tree_id
    left join public.profiles p on p.id = m.user_id
   where m.tree_id = p_tree_id
     and public.is_member(p_tree_id)
   order by (t.owner_id = m.user_id) desc, m.added_at;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.trees        enable row level security;
alter table public.tree_members enable row level security;
alter table public.invites      enable row level security;
alter table public.persons      enable row level security;
alter table public.unions       enable row level security;
alter table public.parent_child enable row level security;
alter table public.audit_log    enable row level security;

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

-- profiles: you see and edit only your own
create policy profiles_self_read   on public.profiles for select using (id = auth.uid());
create policy profiles_self_write  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());

-- trees
create policy trees_read   on public.trees for select using (public.is_member(id));
create policy trees_update on public.trees for update using (public.is_admin(id)) with check (public.is_admin(id));
create policy trees_delete on public.trees for delete using (owner_id = auth.uid());
-- inserts go through create_tree() only
create policy trees_insert on public.trees for insert with check (owner_id = auth.uid());

-- tree_members
create policy tm_read   on public.tree_members for select using (public.is_member(tree_id));
create policy tm_self_leave on public.tree_members for delete using (user_id = auth.uid());

-- invites: admins manage; nobody reads codes of trees they are not in
create policy inv_read   on public.invites for select using (public.is_admin(tree_id));
create policy inv_update on public.invites for update using (public.is_admin(tree_id)) with check (public.is_admin(tree_id));
create policy inv_delete on public.invites for delete using (public.is_admin(tree_id));

-- persons
create policy persons_read   on public.persons for select using (public.is_member(tree_id));
create policy persons_insert on public.persons for insert with check (public.can_edit(tree_id));
create policy persons_update on public.persons for update using (public.can_edit(tree_id)) with check (public.can_edit(tree_id));
create policy persons_delete on public.persons for delete using (public.can_edit(tree_id));

-- unions
create policy unions_read   on public.unions for select using (public.is_member(tree_id));
create policy unions_insert on public.unions for insert with check (public.can_edit(tree_id));
create policy unions_update on public.unions for update using (public.can_edit(tree_id)) with check (public.can_edit(tree_id));
create policy unions_delete on public.unions for delete using (public.can_edit(tree_id));

-- parent_child
create policy pc_read   on public.parent_child for select using (public.is_member(tree_id));
create policy pc_insert on public.parent_child for insert with check (public.can_edit(tree_id));
create policy pc_update on public.parent_child for update using (public.can_edit(tree_id)) with check (public.can_edit(tree_id));
create policy pc_delete on public.parent_child for delete using (public.can_edit(tree_id));

-- audit log: readable by members, written only by triggers
create policy audit_read on public.audit_log for select using (public.is_member(tree_id));

-- =====================================================================
-- PHOTO STORAGE
-- Private bucket. Object path is  <tree_id>/<person_id>-<random>.<ext>
-- so the first path segment tells RLS which tree the photo belongs to.
-- The app reads photos through short-lived signed URLs; nothing is public.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic'];

drop policy if exists photos_read   on storage.objects;
drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;

create policy photos_read on storage.objects for select
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy photos_insert on storage.objects for insert
  with check (bucket_id = 'photos' and public.can_edit(((storage.foldername(name))[1])::uuid));

create policy photos_update on storage.objects for update
  using (bucket_id = 'photos' and public.can_edit(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'photos' and public.can_edit(((storage.foldername(name))[1])::uuid));

create policy photos_delete on storage.objects for delete
  using (bucket_id = 'photos' and public.can_edit(((storage.foldername(name))[1])::uuid));

-- =====================================================================
-- REALTIME (live updates when a relative edits)
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['persons','unions','parent_child'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- DONE
-- =====================================================================
