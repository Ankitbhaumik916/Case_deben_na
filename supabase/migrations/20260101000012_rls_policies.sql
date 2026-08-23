-- =============================================================================
-- 0012 ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- Every table is org-scoped and denies by default. The role ladder is
-- read_only(1) < investigator(2) < reviewer(3) < admin(4) < super_admin(5),
-- evaluated by the SECURITY DEFINER helpers in 0001 so that policies never
-- recurse through user_roles.
-- =============================================================================

create or replace function public.shares_org_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles mine
    join public.user_roles theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Bulk policy generation for the three standard tiers.
--   member_write : any investigator may write        (case data)
--   admin_write  : only admins may write             (case type templates)
--   read_only    : no client writes at all           (audit trail)
-- Reads are always "member of the owning org".
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  member_write text[] := array[
    'case_field_values', 'case_people', 'case_investigators', 'case_section_status',
    'case_checklist_responses', 'evidence_items', 'custody_events',
    'media_files', 'media_log_reports', 'interviews',
    'case_report_section_drafts', 'report_section_status'
  ];
  admin_write text[] := array[
    'case_types', 'case_type_sections', 'case_type_fields', 'case_statuses',
    'case_type_checklists', 'checklist_items', 'case_type_report_sections',
    'retention_schedules'
  ];
  read_only_tables text[] := array['activity_logs'];
begin
  foreach t in array member_write || admin_write || read_only_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (public.is_org_member(org_id))',
      t || '_select', t);
  end loop;

  foreach t in array member_write loop
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check (public.can_write(org_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (public.can_write(org_id)) with check (public.can_write(org_id))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      'using (public.can_write(org_id))',
      t || '_delete', t);
  end loop;

  foreach t in array admin_write loop
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check (public.can_admin(org_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (public.can_admin(org_id)) with check (public.can_admin(org_id))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      'using (public.can_admin(org_id))',
      t || '_delete', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables with bespoke rules
-- -----------------------------------------------------------------------------

-- ---------- organizations ---------------------------------------------------
alter table public.organizations enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.can_admin(id))
  with check (public.can_admin(id));
-- no insert/delete policy: orgs are provisioned with the service role

-- ---------- roles (static lookup) -------------------------------------------
alter table public.roles enable row level security;

create policy roles_select on public.roles
  for select to authenticated
  using (true);

-- ---------- users -----------------------------------------------------------
alter table public.users enable row level security;

create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

create policy users_update on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_super_admin(org_id))
  with check (id = auth.uid() or public.is_super_admin(org_id));

create policy users_insert on public.users
  for insert to authenticated
  with check (public.is_super_admin(org_id));
-- no delete policy: users are deactivated (is_active = false), never removed

-- ---------- user_roles ------------------------------------------------------
alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (public.is_org_member(org_id));

create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.is_super_admin(org_id));

create policy user_roles_update on public.user_roles
  for update to authenticated
  using (public.is_super_admin(org_id))
  with check (public.is_super_admin(org_id));

create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (public.is_super_admin(org_id));

-- ---------- cases -----------------------------------------------------------
-- Deleting a case is an admin action; investigators archive instead.
-- Moving INTO an approval status additionally goes through
-- public.enforce_status_transition().
alter table public.cases enable row level security;

create policy cases_select on public.cases
  for select to authenticated
  using (public.is_org_member(org_id));

create policy cases_insert on public.cases
  for insert to authenticated
  with check (public.can_write(org_id));

create policy cases_update on public.cases
  for update to authenticated
  using (public.can_write(org_id))
  with check (public.can_write(org_id));

create policy cases_delete on public.cases
  for delete to authenticated
  using (public.can_admin(org_id));

-- ---------- reports ---------------------------------------------------------
-- Anyone who can write may generate a version; discarding a generated version
-- requires reviewer, since prior versions are part of the case record.
alter table public.reports enable row level security;

create policy reports_select on public.reports
  for select to authenticated
  using (public.is_org_member(org_id));

create policy reports_insert on public.reports
  for insert to authenticated
  with check (public.can_write(org_id));

create policy reports_update on public.reports
  for update to authenticated
  using (public.can_write(org_id))
  with check (public.can_write(org_id));

create policy reports_delete on public.reports
  for delete to authenticated
  using (public.can_review(org_id));

-- ---------- saved views -----------------------------------------------------
-- Personal views belong to their owner; shared ("locked") views are org
-- furniture and only an admin may change them.
alter table public.saved_views enable row level security;

create policy saved_views_select on public.saved_views
  for select to authenticated
  using (public.is_org_member(org_id) and (user_id = auth.uid() or is_shared));

create policy saved_views_insert on public.saved_views
  for insert to authenticated
  with check (
    public.is_org_member(org_id)
    and (
      (user_id = auth.uid() and not is_locked)
      or (is_shared and public.can_admin(org_id))
    )
  );

create policy saved_views_update on public.saved_views
  for update to authenticated
  using (
    public.is_org_member(org_id)
    and ((user_id = auth.uid() and not is_locked) or public.can_admin(org_id))
  )
  with check (
    public.is_org_member(org_id)
    and ((user_id = auth.uid() and not is_locked) or public.can_admin(org_id))
  );

create policy saved_views_delete on public.saved_views
  for delete to authenticated
  using (
    public.is_org_member(org_id)
    and ((user_id = auth.uid() and not is_locked) or public.can_admin(org_id))
  );

-- ---------- admin notes -----------------------------------------------------
alter table public.admin_notes enable row level security;

create policy admin_notes_select on public.admin_notes
  for select to authenticated
  using (public.is_org_member(org_id));

create policy admin_notes_insert on public.admin_notes
  for insert to authenticated
  with check (public.can_write(org_id) and author_id = auth.uid());

create policy admin_notes_update on public.admin_notes
  for update to authenticated
  using (author_id = auth.uid() or public.can_admin(org_id))
  with check (author_id = auth.uid() or public.can_admin(org_id));

create policy admin_notes_delete on public.admin_notes
  for delete to authenticated
  using (author_id = auth.uid() or public.can_admin(org_id));

-- activity_logs deliberately has SELECT only. Rows are written by the audit
-- triggers and public.log_activity(), both SECURITY DEFINER, so the trail
-- cannot be edited or erased by any client role.

-- =============================================================================
-- GRANTS
-- =============================================================================
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- anon is never allowed to touch case data; everything requires a session
revoke all on all tables in schema public from anon;

-- Functions default to EXECUTE for PUBLIC, which would expose the SECURITY
-- DEFINER helpers (e.g. build_case_search_document could dump another org's
-- text). Lock everything down, then re-grant the ones policies and the app need.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.role_rank(text),
  public.current_role_rank(uuid),
  public.is_org_member(uuid),
  public.can_write(uuid),
  public.can_review(uuid),
  public.can_admin(uuid),
  public.is_super_admin(uuid),
  public.shares_org_with(uuid),
  public.jsonb_is_filled(jsonb),
  public.jsonb_to_search_text(jsonb),
  public.log_activity(text, uuid, uuid, text, uuid, text, jsonb)
to authenticated;

grant execute on all functions in schema public to service_role;
