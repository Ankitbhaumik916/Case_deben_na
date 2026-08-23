-- =============================================================================
-- 0009 CHECKLIST RESPONSES, ADMIN NOTES, RETENTION, AUDIT TRAIL
-- =============================================================================

-- ---------- per-case checklist responses ------------------------------------
create table public.case_checklist_responses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  case_id      uuid not null,
  item_id      uuid not null,
  is_checked   boolean not null default false,
  note         text,
  completed_by uuid references public.users (id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint case_checklist_responses_unique unique (case_id, item_id),
  constraint case_checklist_responses_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint case_checklist_responses_item_fkey
    foreign key (item_id, org_id)
    references public.checklist_items (id, org_id) on delete cascade
);

create index case_checklist_responses_case_idx
  on public.case_checklist_responses (case_id);

create trigger case_checklist_responses_inherit_org
  before insert on public.case_checklist_responses
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger case_checklist_responses_set_updated_at
  before update on public.case_checklist_responses
  for each row execute function public.set_updated_at();

-- Stamp who ticked the box and when.
create or replace function public.touch_checklist_completion()
returns trigger
language plpgsql
as $$
begin
  if new.is_checked and (tg_op = 'INSERT' or not old.is_checked) then
    new.completed_at := now();
    new.completed_by := coalesce(new.completed_by, auth.uid());
  elsif not new.is_checked then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger case_checklist_responses_touch_completion
  before insert or update on public.case_checklist_responses
  for each row execute function public.touch_checklist_completion();

-- ---------- admin notes (threaded, per case) --------------------------------
create table public.admin_notes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  case_id    uuid not null,
  parent_id  uuid references public.admin_notes (id) on delete cascade,
  author_id  uuid references public.users (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_notes_id_org_key unique (id, org_id),
  constraint admin_notes_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint admin_notes_body_not_blank check (length(btrim(body)) > 0)
);

create index admin_notes_case_idx on public.admin_notes (case_id, created_at desc);
create index admin_notes_parent_idx on public.admin_notes (parent_id);

create trigger admin_notes_inherit_org
  before insert on public.admin_notes
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger admin_notes_set_updated_at
  before update on public.admin_notes
  for each row execute function public.set_updated_at();

-- ---------- retention policy ------------------------------------------------
-- case_type_id NULL = org-wide default policy.
create table public.retention_schedules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  case_type_id    uuid,
  retention_years int not null default 7,
  policy_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint retention_schedules_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete cascade,
  constraint retention_schedules_years_positive check (retention_years > 0)
);

create unique index retention_schedules_scope_idx
  on public.retention_schedules (
    org_id,
    coalesce(case_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create trigger retention_schedules_set_updated_at
  before update on public.retention_schedules
  for each row execute function public.set_updated_at();

-- ---------- audit trail -----------------------------------------------------
-- Append-only. No update or delete policy exists for this table, so rows are
-- immutable to every client role.
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  case_id     uuid references public.cases (id) on delete set null,
  actor_id    uuid references public.users (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  summary     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint activity_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index activity_logs_org_idx on public.activity_logs (org_id, created_at desc);
create index activity_logs_case_idx on public.activity_logs (case_id, created_at desc);
create index activity_logs_actor_idx on public.activity_logs (actor_id, created_at desc);
create index activity_logs_action_idx on public.activity_logs (action);

-- The single writer used by application code (logActivity() in the app calls
-- this via RPC). Database-level triggers in 0011 cover data mutations; this
-- covers actions that have no row behind them (exports, PDF downloads, logins).
create or replace function public.log_activity(
  p_action      text,
  p_org_id      uuid default null,
  p_case_id     uuid default null,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_summary     text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := p_org_id;
  v_id     uuid;
begin
  if v_org_id is null and p_case_id is not null then
    select org_id into v_org_id from public.cases where id = p_case_id;
  end if;

  if v_org_id is null then
    raise exception 'log_activity requires an org_id or a resolvable case_id';
  end if;

  if auth.uid() is not null and not public.is_org_member(v_org_id) then
    raise exception 'not_a_member_of_org' using errcode = '42501';
  end if;

  insert into public.activity_logs
    (org_id, case_id, actor_id, action, target_type, target_id, summary, metadata)
  values
    (v_org_id, p_case_id, auth.uid(), p_action, p_target_type, p_target_id,
     p_summary, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;
