-- =============================================================================
-- 0010 FULL TEXT SEARCH, SECTION COMPLETION, REPORTING VIEWS
-- =============================================================================

-- ---------- "is this dynamic value actually filled in?" ----------------------
-- One definition, used by the completion dots, the report readiness check and
-- the search document builder.
create or replace function public.jsonb_is_filled(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_value is null then false
    when jsonb_typeof(p_value) = 'null' then false
    when jsonb_typeof(p_value) = 'string' then length(btrim(p_value #>> '{}')) > 0
    when jsonb_typeof(p_value) = 'array' then jsonb_array_length(p_value) > 0
    when jsonb_typeof(p_value) = 'object' then p_value <> '{}'::jsonb
    else true
  end;
$$;

-- Flatten any jsonb value to searchable text.
create or replace function public.jsonb_to_search_text(p_value jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_value is null then ''
    when jsonb_typeof(p_value) = 'string' then p_value #>> '{}'
    when jsonb_typeof(p_value) in ('number', 'boolean') then p_value #>> '{}'
    when jsonb_typeof(p_value) = 'array' then (
      select coalesce(string_agg(public.jsonb_to_search_text(e), ' '), '')
      from jsonb_array_elements(p_value) e
    )
    when jsonb_typeof(p_value) = 'object' then (
      select coalesce(string_agg(public.jsonb_to_search_text(v), ' '), '')
      from jsonb_each(p_value) as kv(k, v)
    )
    else ''
  end;
$$;

-- ---------- search document -------------------------------------------------
create or replace function public.build_case_search_document(p_case_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select btrim(concat_ws(' ',
    c.case_number, c.title, c.address, c.address_line2,
    c.city, c.county, c.state, c.postal_code,
    (select string_agg(p.full_name || ' ' || coalesce(p.role, ''), ' ')
       from public.case_people p where p.case_id = c.id),
    (select string_agg(public.jsonb_to_search_text(v.value), ' ')
       from public.case_field_values v where v.case_id = c.id)
  ))
  from public.cases c
  where c.id = p_case_id;
$$;

create or replace function public.refresh_case_search(p_case_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.cases
     set search_document = public.build_case_search_document(p_case_id)
   where id = p_case_id;
$$;

create or replace function public.trg_refresh_case_search()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_case_search(coalesce(new.case_id, old.case_id));
  return null;
end;
$$;

create or replace function public.trg_refresh_own_case_search()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_case_search(new.id);
  return null;
end;
$$;

-- Only fires when a searchable column is written, so the UPDATE issued by
-- refresh_case_search (which touches search_document alone) cannot recurse.
create trigger cases_refresh_search
  after insert or update of
    case_number, title, address, address_line2, city, county, state, postal_code
  on public.cases
  for each row execute function public.trg_refresh_own_case_search();

create trigger case_people_refresh_search
  after insert or update or delete on public.case_people
  for each row execute function public.trg_refresh_case_search();

create trigger case_field_values_refresh_search
  after insert or update or delete on public.case_field_values
  for each row execute function public.trg_refresh_case_search();

-- ---------- manual section completion ---------------------------------------
-- Backs the 'manual' completion_rule: an investigator ticks the section done.
create table public.case_section_status (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  case_id     uuid not null,
  section_id  uuid not null,
  is_complete boolean not null default false,
  updated_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint case_section_status_unique unique (case_id, section_id),
  constraint case_section_status_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint case_section_status_section_fkey
    foreign key (section_id, org_id)
    references public.case_type_sections (id, org_id) on delete cascade
);

create index case_section_status_case_idx on public.case_section_status (case_id);

create trigger case_section_status_inherit_org
  before insert on public.case_section_status
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger case_section_status_set_updated_at
  before update on public.case_section_status
  for each row execute function public.set_updated_at();

-- =============================================================================
-- VIEWS
-- All views are security_invoker so the caller's RLS applies. Without this a
-- view would run as its owner and leak every org.
-- =============================================================================

-- ---------- case list -------------------------------------------------------
create view public.case_list_view
with (security_invoker = true) as
select
  c.id,
  c.org_id,
  c.case_number,
  c.title,
  c.address,
  c.city,
  c.county,
  c.state,
  c.lat,
  c.lng,
  c.incident_date,
  c.created_at,
  c.updated_at,
  c.closed_at,
  c.archived_at,
  c.case_type_id,
  ct.name  as case_type_name,
  ct.slug  as case_type_slug,
  ct.color as case_type_color,
  ct.icon  as case_type_icon,
  c.status_id,
  s.key    as status_key,
  s.label  as status_label,
  s.color  as status_color,
  s.sort_order as status_sort_order,
  c.lead_investigator_id,
  lead.full_name as lead_investigator_name,
  c.created_by,
  creator.full_name as created_by_name,
  -- days_open cannot be a generated column (now() is not immutable), so it is
  -- computed here and read through this view everywhere.
  greatest(0, (date_part('day', coalesce(c.closed_at, now()) - c.created_at))::int)
    as days_open
from public.cases c
join public.case_types ct on ct.id = c.case_type_id
left join public.case_statuses s on s.id = c.status_id
left join public.users lead on lead.id = c.lead_investigator_id
left join public.users creator on creator.id = c.created_by;

-- ---------- section completion (sidebar dots) -------------------------------
create view public.case_section_completion
with (security_invoker = true) as
select
  c.id  as case_id,
  c.org_id,
  sec.id as section_id,
  sec.key as section_key,
  sec.label as section_label,
  sec.completion_rule,
  count(f.id) filter (where f.is_active) as total_fields,
  count(f.id) filter (where f.is_active and public.jsonb_is_filled(v.value)) as filled_fields,
  count(f.id) filter (where f.is_active and coalesce((f.validation ->> 'required')::boolean, false))
    as required_fields,
  count(f.id) filter (
    where f.is_active
      and coalesce((f.validation ->> 'required')::boolean, false)
      and public.jsonb_is_filled(v.value)
  ) as filled_required_fields,
  coalesce(bool_or(css.is_complete), false) as manually_complete
from public.cases c
join public.case_type_sections sec
  on sec.case_type_id = c.case_type_id and sec.is_active
left join public.case_type_fields f on f.section_id = sec.id
left join public.case_field_values v on v.field_id = f.id and v.case_id = c.id
left join public.case_section_status css on css.case_id = c.id and css.section_id = sec.id
group by c.id, c.org_id, sec.id, sec.key, sec.label, sec.completion_rule;

-- ---------- checklist progress ----------------------------------------------
create view public.case_checklist_progress
with (security_invoker = true) as
select
  c.id as case_id,
  c.org_id,
  cl.id as checklist_id,
  cl.name as checklist_name,
  count(i.id) as total_items,
  count(i.id) filter (where coalesce(r.is_checked, false)) as checked_items,
  count(i.id) filter (where i.is_required) as required_items,
  count(i.id) filter (where i.is_required and coalesce(r.is_checked, false))
    as checked_required_items
from public.cases c
join public.case_type_checklists cl
  on cl.case_type_id = c.case_type_id and cl.is_active
left join public.checklist_items i on i.checklist_id = cl.id
left join public.case_checklist_responses r on r.case_id = c.id and r.item_id = i.id
group by c.id, c.org_id, cl.id, cl.name;

-- ---------- investigator workload (/reports) --------------------------------
create view public.investigator_workload
with (security_invoker = true) as
select
  u.id as user_id,
  -- one row per (user, org): a user assigned cases in two orgs is counted
  -- separately in each
  coalesce(ci.org_id, u.org_id) as org_id,
  u.full_name,
  u.email,
  count(distinct ci.case_id) filter (where ci.role = 'lead')       as lead_cases,
  count(distinct ci.case_id) filter (where ci.role = 'primary')    as primary_cases,
  count(distinct ci.case_id) filter (where ci.role = 'secondary')  as secondary_cases,
  count(distinct ci.case_id) filter (where ci.role = 'additional') as additional_cases,
  count(distinct ci.case_id) as total_cases
from public.users u
left join public.case_investigators ci on ci.user_id = u.id
group by u.id, coalesce(ci.org_id, u.org_id), u.full_name, u.email;
