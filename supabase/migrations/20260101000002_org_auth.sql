-- =============================================================================
-- 0002 ORGANISATIONS, USERS, ROLES
-- =============================================================================

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint organizations_slug_key unique (slug),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0)
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Profile row mirroring auth.users. org_id is the user's HOME org (used to
-- default new records); actual membership is the set of orgs they hold a role
-- in, which is what powers the org switcher and every RLS predicate.
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid references public.organizations (id) on delete set null,
  email       text not null,
  full_name   text,
  avatar_url  text,
  job_title   text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index users_email_lower_key on public.users (lower(email));
create index users_org_id_idx on public.users (org_id);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create table public.roles (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  label  text not null,
  rank   int  not null
);

comment on table public.roles is
  'Canonical role ladder. Kept in sync with public.role_rank().';

insert into public.roles (name, label, rank) values
  ('read_only',    'Read only',    1),
  ('investigator', 'Investigator', 2),
  ('reviewer',     'Reviewer',     3),
  ('admin',        'Administrator',4),
  ('super_admin',  'Super admin',  5);

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete restrict,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  constraint user_roles_unique unique (user_id, role_id, org_id)
);

create index user_roles_user_org_idx on public.user_roles (user_id, org_id);
create index user_roles_org_idx on public.user_roles (org_id);

-- Mirror new auth users into public.users. org_id / full_name are read from the
-- signup metadata written by the invite flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, full_name, org_id)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    (nullif(new.raw_user_meta_data ->> 'org_id', ''))::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- role helpers (defined here: they read public.user_roles) --------
-- SECURITY DEFINER so that policies on user_roles do not recurse into
-- themselves when this is evaluated inside another table's policy.
create or replace function public.current_role_rank(p_org_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(public.role_rank(r.name)), 0)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.org_id = p_org_id;
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_rank(p_org_id) >= 1;
$$;

-- create / edit cases, fields, evidence, media, interviews
create or replace function public.can_write(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_rank(p_org_id) >= 2;
$$;

-- approve / file: sign-off transitions
create or replace function public.can_review(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_rank(p_org_id) >= 3;
$$;

-- manage case-type templates, statuses, checklists, report templates
create or replace function public.can_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_rank(p_org_id) >= 4;
$$;

-- manage users and role assignments
create or replace function public.is_super_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_rank(p_org_id) >= 5;
$$;

comment on function public.can_write(uuid)     is 'investigator and above';
comment on function public.can_review(uuid)    is 'reviewer and above';
comment on function public.can_admin(uuid)     is 'admin and above';
comment on function public.is_super_admin(uuid) is 'super_admin only';
