-- =============================================================================
-- 0001 FOUNDATION: enums, shared trigger functions, role helpers
-- -----------------------------------------------------------------------------
-- Nothing in this file (or anywhere else in the schema) is specific to a
-- discipline. Case types are DATA, defined in the case_type_* tables.
-- =============================================================================

-- ---------- enums -----------------------------------------------------------
-- field_type drives the <DynamicField> component map in the app. Adding a new
-- renderer is the ONLY reason to ever touch this enum.
create type public.field_type as enum (
  'text', 'textarea', 'number', 'date', 'select', 'multiselect',
  'photo', 'file', 'signature', 'boolean', 'person_ref', 'computed'
);

create type public.completion_rule as enum (
  'any_field_filled',
  'all_fields_filled',
  'all_required_fields_filled',
  'manual'
);

create type public.custody_event_type as enum (
  'collected', 'transferred', 'released', 'received', 'returned', 'destroyed'
);

create type public.transcript_status as enum (
  'not_started', 'pending', 'processing', 'complete', 'failed'
);

create type public.summary_length as enum ('brief', 'standard', 'detailed');

create type public.report_status as enum ('draft', 'generated', 'final');

create type public.report_section_state as enum ('complete', 'incomplete', 'excluded');

-- ---------- generic trigger helpers -----------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at.';

-- Every org-scoped child table carries a denormalised org_id so RLS policies
-- stay single-predicate (no joins). This trigger fills it in from the parent
-- row; a composite FK on (parent_id, org_id) then guarantees it can never drift.
create or replace function public.inherit_org_id()
returns trigger
language plpgsql
as $$
declare
  v_parent_table text := tg_argv[0];
  v_fk_column    text := tg_argv[1];
  v_parent_id    uuid;
  v_org_id       uuid;
begin
  if new.org_id is not null then
    return new;
  end if;

  execute format('select ($1).%I', v_fk_column) into v_parent_id using new;

  if v_parent_id is null then
    return new;
  end if;

  execute format('select org_id from %s where id = $1', v_parent_table)
    into v_org_id using v_parent_id;

  new.org_id := v_org_id;
  return new;
end;
$$;

comment on function public.inherit_org_id() is
  'BEFORE INSERT trigger: copies org_id from a parent row. Args: parent_table, fk_column.';

-- ---------- role helpers ----------------------------------------------------
-- Ordered role ladder. Everything above a rank inherits the rights below it.
create or replace function public.role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'read_only'    then 1
    when 'investigator' then 2
    when 'reviewer'     then 3
    when 'admin'        then 4
    when 'super_admin'  then 5
    else 0
  end;
$$;
