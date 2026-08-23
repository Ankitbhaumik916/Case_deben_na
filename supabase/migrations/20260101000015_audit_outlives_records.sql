-- =============================================================================
-- 0015 THE AUDIT TRAIL MUST OUTLIVE THE RECORDS IT DESCRIBES
-- -----------------------------------------------------------------------------
-- Bug this fixes: deleting a case with any child rows failed with
--
--   23503: insert or update on table "activity_logs" violates foreign key
--          constraint "activity_logs_case_id_fkey"
--
-- Deleting a case cascades to its field values, people, evidence, interviews
-- and notes. Each child's AFTER DELETE audit trigger then inserts an
-- activity_logs row carrying that case_id — but the case row is already gone
-- inside the same statement, so the foreign key check fails and the whole
-- delete is rolled back. An empty case deleted fine; any real one could not.
--
-- The fix is not to suppress the logging. It is to recognise that an audit
-- trail should not hold foreign keys to the things it describes: its entire
-- purpose is to survive them. When a case is purged under a retention
-- schedule, "case X was deleted by Y on Z" is precisely the row that must
-- remain. Same argument for the actor: if an account is ever removed, the
-- trail must still say who did what.
--
-- case_id and actor_id therefore become plain identifiers with indexes but no
-- referential action. org_id keeps its cascade, so offboarding a tenant still
-- removes that tenant's trail.
-- =============================================================================

alter table public.activity_logs
  drop constraint if exists activity_logs_case_id_fkey;

alter table public.activity_logs
  drop constraint if exists activity_logs_actor_id_fkey;

comment on column public.activity_logs.case_id is
  'Case this event belongs to. Deliberately not a foreign key: audit rows outlive the case, including a retention purge.';

comment on column public.activity_logs.actor_id is
  'User who performed the action. Deliberately not a foreign key, for the same reason.';

-- Now that the reference is loose, a case deletion can keep pointing at the
-- case it removed, which is what makes the event traceable afterwards.
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
