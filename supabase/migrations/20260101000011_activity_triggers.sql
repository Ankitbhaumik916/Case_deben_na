-- =============================================================================
-- 0011 AUDIT TRIGGERS
-- -----------------------------------------------------------------------------
-- Data mutations are logged by the database, not by the client, so the trail is
-- complete even for direct REST calls. Application-level events that have no
-- row behind them (exports, PDF downloads, sign-ins) go through
-- public.log_activity() instead.
-- =============================================================================

-- Columns that change on every write and would otherwise drown the diff.
create or replace function public.audit_ignored_columns()
returns text[]
language sql
immutable
as $$
  select array[
    'updated_at', 'created_at', 'search_document', 'search_tsv',
    'updated_by', 'edited_by'
  ];
$$;

create or replace function public.truncate_jsonb_value(p_value jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) = 'string' and length(p_value #>> '{}') > 280
      then to_jsonb(left(p_value #>> '{}', 280) || '...')
    when length(p_value::text) > 1000
      then to_jsonb(left(p_value::text, 1000) || '...')
    else p_value
  end;
$$;

-- Changed-column diff, with long values truncated so transcripts and narratives
-- do not end up duplicated in the audit table.
create or replace function public.diff_jsonb(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_object_agg(
      key,
      jsonb_build_object(
        'from', public.truncate_jsonb_value(old_value),
        'to',   public.truncate_jsonb_value(new_value)
      )
    ),
    '{}'::jsonb
  )
  from (
    select
      coalesce(o.key, n.key) as key,
      o.value as old_value,
      n.value as new_value
    from jsonb_each(coalesce(p_old, '{}'::jsonb)) o
    full outer join jsonb_each(coalesce(p_new, '{}'::jsonb)) n on n.key = o.key
  ) pairs
  where old_value is distinct from new_value
    and key <> all (public.audit_ignored_columns());
$$;

-- Generic audit trigger.
--   arg0: target_type label, e.g. 'case', 'evidence', 'media'
--   arg1: how to reach the case  -> 'id' | 'case_id' | 'none'
--   arg2: (optional) parent table used to resolve case_id
--   arg3: (optional) fk column on this row pointing at that parent
create or replace function public.trg_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_type text := tg_argv[0];
  v_case_source text := tg_argv[1];
  v_parent_table text := case when tg_nargs > 2 then tg_argv[2] end;
  v_parent_fk    text := case when tg_nargs > 3 then tg_argv[3] end;
  v_row     record;
  v_row_json jsonb;
  v_old_json jsonb;
  v_case_id uuid;
  v_org_id  uuid;
  v_action  text;
  v_metadata jsonb := '{}'::jsonb;
  v_parent_id uuid;
  v_old_status uuid;
  v_new_status uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  v_row_json := to_jsonb(v_row);
  v_org_id := (v_row_json ->> 'org_id')::uuid;

  if v_org_id is null then
    return null;
  end if;

  -- resolve the case this write belongs to (template edits have none)
  if v_case_source = 'id' then
    v_case_id := (v_row_json ->> 'id')::uuid;
  elsif v_case_source = 'case_id' then
    v_case_id := (v_row_json ->> 'case_id')::uuid;
  elsif v_parent_table is not null then
    v_parent_id := (v_row_json ->> v_parent_fk)::uuid;
    if v_parent_id is not null then
      execute format('select case_id from %s where id = $1', v_parent_table)
        into v_case_id using v_parent_id;
    end if;
  end if;

  -- a deleted case must not be referenced by the log row that records it
  if tg_op = 'DELETE' and v_case_source = 'id' then
    v_case_id := null;
  end if;

  if tg_op = 'INSERT' then
    v_action := v_target_type || '.created';
    v_metadata := jsonb_build_object('record', public.truncate_jsonb_value(v_row_json));
  elsif tg_op = 'DELETE' then
    v_action := v_target_type || '.deleted';
    v_metadata := jsonb_build_object('record', public.truncate_jsonb_value(v_row_json));
  else
    v_old_json := to_jsonb(old);
    v_metadata := jsonb_build_object('changes', public.diff_jsonb(v_old_json, v_row_json));

    -- nothing meaningful changed (e.g. a search-document refresh)
    if v_metadata -> 'changes' = '{}'::jsonb then
      return null;
    end if;

    v_action := v_target_type || '.updated';

    if v_target_type = 'case' then
      v_old_status := (v_old_json ->> 'status_id')::uuid;
      v_new_status := (v_row_json ->> 'status_id')::uuid;
      if v_new_status is distinct from v_old_status then
        v_action := 'case.status_changed';
        v_metadata := v_metadata || jsonb_build_object(
          'from_status', (select label from public.case_statuses where id = v_old_status),
          'to_status',   (select label from public.case_statuses where id = v_new_status)
        );
      end if;
    end if;
  end if;

  insert into public.activity_logs
    (org_id, case_id, actor_id, action, target_type, target_id, metadata)
  values
    (v_org_id, v_case_id, auth.uid(), v_action, v_target_type,
     (v_row_json ->> 'id')::uuid, v_metadata);

  return null;
end;
$$;

-- ---------- case data -------------------------------------------------------
create trigger cases_audit
  after insert or update or delete on public.cases
  for each row execute function public.trg_audit('case', 'id');

create trigger case_field_values_audit
  after insert or update or delete on public.case_field_values
  for each row execute function public.trg_audit('field_value', 'case_id');

create trigger case_people_audit
  after insert or update or delete on public.case_people
  for each row execute function public.trg_audit('person', 'case_id');

create trigger case_investigators_audit
  after insert or update or delete on public.case_investigators
  for each row execute function public.trg_audit('assignment', 'case_id');

create trigger case_section_status_audit
  after insert or update or delete on public.case_section_status
  for each row execute function public.trg_audit('section_status', 'case_id');

create trigger case_checklist_responses_audit
  after insert or update or delete on public.case_checklist_responses
  for each row execute function public.trg_audit('checklist_response', 'case_id');

create trigger admin_notes_audit
  after insert or update or delete on public.admin_notes
  for each row execute function public.trg_audit('admin_note', 'case_id');

-- ---------- evidence --------------------------------------------------------
create trigger evidence_items_audit
  after insert or update or delete on public.evidence_items
  for each row execute function public.trg_audit('evidence', 'case_id');

create trigger custody_events_audit
  after insert or update or delete on public.custody_events
  for each row execute function
    public.trg_audit('custody_event', 'lookup', 'public.evidence_items', 'evidence_id');

-- ---------- media, interviews, reports --------------------------------------
create trigger media_files_audit
  after insert or update or delete on public.media_files
  for each row execute function public.trg_audit('media', 'case_id');

create trigger media_log_reports_audit
  after insert or update or delete on public.media_log_reports
  for each row execute function public.trg_audit('media_log', 'case_id');

create trigger interviews_audit
  after insert or update or delete on public.interviews
  for each row execute function public.trg_audit('interview', 'case_id');

create trigger reports_audit
  after insert or update or delete on public.reports
  for each row execute function public.trg_audit('report', 'case_id');

create trigger case_report_section_drafts_audit
  after insert or update or delete on public.case_report_section_drafts
  for each row execute function public.trg_audit('report_draft', 'case_id');

-- ---------- template / admin changes (org scoped, no case) ------------------
create trigger case_types_audit
  after insert or update or delete on public.case_types
  for each row execute function public.trg_audit('case_type', 'none');

create trigger case_type_sections_audit
  after insert or update or delete on public.case_type_sections
  for each row execute function public.trg_audit('case_type_section', 'none');

create trigger case_type_fields_audit
  after insert or update or delete on public.case_type_fields
  for each row execute function public.trg_audit('case_type_field', 'none');

create trigger case_statuses_audit
  after insert or update or delete on public.case_statuses
  for each row execute function public.trg_audit('case_status', 'none');

create trigger case_type_checklists_audit
  after insert or update or delete on public.case_type_checklists
  for each row execute function public.trg_audit('checklist', 'none');

create trigger checklist_items_audit
  after insert or update or delete on public.checklist_items
  for each row execute function public.trg_audit('checklist_item', 'none');

create trigger case_type_report_sections_audit
  after insert or update or delete on public.case_type_report_sections
  for each row execute function public.trg_audit('report_section', 'none');

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.trg_audit('user_role', 'none');

create trigger retention_schedules_audit
  after insert or update or delete on public.retention_schedules
  for each row execute function public.trg_audit('retention_schedule', 'none');
