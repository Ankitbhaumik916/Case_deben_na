-- =============================================================================
-- 0004 CASES
-- =============================================================================

create table public.cases (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  case_type_id         uuid not null,
  status_id            uuid,
  case_number          text not null,
  title                text,
  address              text,
  address_line2        text,
  city                 text,
  county               text,
  state                text,
  postal_code          text,
  lat                  double precision,
  lng                  double precision,
  incident_date        date,
  lead_investigator_id uuid references public.users (id) on delete set null,
  created_by           uuid references public.users (id) on delete set null,
  closed_at            timestamptz,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- maintained by refresh_case_search(); covers case number, address and the
  -- text of every person and field value on the case
  search_document      text,
  search_tsv           tsvector generated always as
                         (to_tsvector('english', coalesce(search_document, ''))) stored,
  constraint cases_org_number_key unique (org_id, case_number),
  constraint cases_id_org_key unique (id, org_id),
  constraint cases_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete restrict,
  constraint cases_status_fkey
    foreign key (status_id, org_id)
    references public.case_statuses (id, org_id) on delete restrict,
  constraint cases_lat_range check (lat is null or lat between -90 and 90),
  constraint cases_lng_range check (lng is null or lng between -180 and 180)
);

create index cases_org_idx on public.cases (org_id);
create index cases_type_idx on public.cases (case_type_id);
create index cases_status_idx on public.cases (status_id);
create index cases_lead_idx on public.cases (lead_investigator_id);
create index cases_created_at_idx on public.cases (created_at desc);
create index cases_search_idx on public.cases using gin (search_tsv);
create index cases_geo_idx on public.cases (lat, lng) where lat is not null and lng is not null;

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

-- ---------- default status --------------------------------------------------
-- Picks the case type's own initial status, falling back to the org-wide one.
create or replace function public.apply_default_case_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status_id is null then
    select s.id into new.status_id
    from public.case_statuses s
    where s.org_id = new.org_id
      and s.is_active
      and s.is_initial
      and (s.case_type_id = new.case_type_id or s.case_type_id is null)
    order by (s.case_type_id is null), s.sort_order
    limit 1;
  end if;
  return new;
end;
$$;

create trigger cases_apply_default_status
  before insert on public.cases
  for each row execute function public.apply_default_case_status();

-- ---------- status transition guard -----------------------------------------
-- Statuses flagged requires_review_role (approved / filed / ...) may only be
-- entered by reviewer and above. Enforced in the database so it holds for the
-- REST API too, not just the UI. Skipped for service-role / background jobs,
-- which have no auth.uid().
create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requires_review boolean;
  v_label text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status_id is distinct from old.status_id and new.status_id is not null then
    select requires_review_role, label
      into v_requires_review, v_label
    from public.case_statuses
    where id = new.status_id;

    if coalesce(v_requires_review, false) and not public.can_review(new.org_id) then
      raise exception
        'insufficient_role: moving a case to "%" requires the reviewer role', v_label
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger cases_enforce_status_transition
  before update on public.cases
  for each row execute function public.enforce_status_transition();

-- ---------- dynamic field values --------------------------------------------
-- One row per (case, configured field). value is jsonb so a single table serves
-- every field_type: scalars for text/number/boolean, arrays for multiselect,
-- objects for photo/file/signature/person_ref payloads.
create table public.case_field_values (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  case_id    uuid not null,
  field_id   uuid not null,
  value      jsonb,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_field_values_case_field_key unique (case_id, field_id),
  constraint case_field_values_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint case_field_values_field_fkey
    foreign key (field_id, org_id)
    references public.case_type_fields (id, org_id) on delete cascade
);

create index case_field_values_case_idx on public.case_field_values (case_id);
create index case_field_values_field_idx on public.case_field_values (field_id);

create trigger case_field_values_inherit_org
  before insert on public.case_field_values
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger case_field_values_set_updated_at
  before update on public.case_field_values
  for each row execute function public.set_updated_at();

-- ---------- people ----------------------------------------------------------
-- role is free text (witness, suspect, victim, owner, ...) because the set of
-- meaningful roles differs per discipline and must not be hardcoded.
create table public.case_people (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  case_id      uuid not null,
  role         text not null default 'witness',
  full_name    text not null,
  contact_info jsonb not null default '{}'::jsonb,
  notes        text,
  sort_order   int not null default 0,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint case_people_id_org_key unique (id, org_id),
  constraint case_people_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint case_people_contact_object check (jsonb_typeof(contact_info) = 'object')
);

create index case_people_case_idx on public.case_people (case_id);
create index case_people_name_idx on public.case_people (org_id, lower(full_name));

create trigger case_people_inherit_org
  before insert on public.case_people
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger case_people_set_updated_at
  before update on public.case_people
  for each row execute function public.set_updated_at();

-- ---------- investigator assignments ----------------------------------------
-- Powers the workload table in /reports.
create table public.case_investigators (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  case_id     uuid not null,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        text not null default 'primary',
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.users (id) on delete set null,
  constraint case_investigators_unique unique (case_id, user_id, role),
  constraint case_investigators_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade
);

create index case_investigators_user_idx on public.case_investigators (user_id);
create index case_investigators_case_idx on public.case_investigators (case_id);

create trigger case_investigators_inherit_org
  before insert on public.case_investigators
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

-- ---------- saved views -----------------------------------------------------
-- user_id null  = org-wide view. is_locked = shared view that only an admin
-- may edit (rendered with a lock icon in the sidebar).
create table public.saved_views (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid references public.users (id) on delete cascade,
  case_type_id uuid,
  name         text not null,
  view_mode    text not null default 'list',
  filters      jsonb not null default '{}'::jsonb,
  columns      jsonb not null default '[]'::jsonb,
  sort         jsonb not null default '{}'::jsonb,
  is_shared    boolean not null default false,
  is_locked    boolean not null default false,
  sort_order   int not null default 0,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint saved_views_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete cascade,
  constraint saved_views_mode_valid check (view_mode in ('list', 'map', 'stats')),
  constraint saved_views_shared_has_no_owner check (user_id is not null or is_shared)
);

create index saved_views_org_user_idx on public.saved_views (org_id, user_id);

create trigger saved_views_set_updated_at
  before update on public.saved_views
  for each row execute function public.set_updated_at();
