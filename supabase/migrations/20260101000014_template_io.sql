-- =============================================================================
-- 0014 CASE TYPE TEMPLATE IMPORT / EXPORT / DUPLICATE
-- -----------------------------------------------------------------------------
-- A whole discipline is expressible as one JSON document. These functions are
-- what the Case Type Builder uses for "duplicate case type", what the seed uses
-- to install starter templates, and what makes a template portable between
-- organisations.
--
-- Deliberately SECURITY INVOKER: the caller's RLS decides whether they may
-- create case types, so there is no privileged path around the admin policy.
--
-- Spec shape:
-- {
--   "name", "slug", "icon", "color", "description",
--   "statuses":   [ { "key","label","color","is_initial","is_terminal",
--                     "requires_review_role" } ],
--   "sections":   [ { "key","label","icon","tab_key","tab_label",
--                     "tab_sort_order","is_required","completion_rule",
--                     "fields":[ { "key","label","field_type","options",
--                                  "validation","help_text","placeholder",
--                                  "width" } ] } ],
--   "checklists": [ { "name","source_standard","version",
--                     "items":[ { "section_ref","label","help_text",
--                                 "is_required" } ] } ],
--   "report_sections": [ { "heading","source_section_keys":[],"draft_prompt" } ]
-- }
-- sort_order is taken from array position unless given explicitly.
-- =============================================================================

create or replace function public.install_case_type_template(
  p_org_id uuid,
  p_spec   jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_case_type_id uuid;
  v_section_id   uuid;
  v_checklist_id uuid;
  v_source_ids   jsonb;
  r_status    record;
  r_section   record;
  r_field     record;
  r_checklist record;
  r_item      record;
  r_report    record;
begin
  if p_spec ->> 'name' is null or p_spec ->> 'slug' is null then
    raise exception 'template spec requires a name and a slug';
  end if;

  insert into public.case_types (org_id, name, slug, description, icon, color, created_by)
  values (
    p_org_id,
    p_spec ->> 'name',
    p_spec ->> 'slug',
    p_spec ->> 'description',
    coalesce(p_spec ->> 'icon', 'folder'),
    coalesce(p_spec ->> 'color', '#2563eb'),
    auth.uid()
  )
  returning id into v_case_type_id;

  -- ---- statuses (omit to inherit the org-wide default set) ----
  for r_status in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_spec -> 'statuses', '[]'::jsonb)) with ordinality
  loop
    insert into public.case_statuses (
      org_id, case_type_id, key, label, color, sort_order,
      is_initial, is_terminal, requires_review_role
    ) values (
      p_org_id,
      v_case_type_id,
      r_status.value ->> 'key',
      r_status.value ->> 'label',
      coalesce(r_status.value ->> 'color', '#64748b'),
      coalesce((r_status.value ->> 'sort_order')::int, (r_status.ordinality - 1)::int),
      coalesce((r_status.value ->> 'is_initial')::boolean, false),
      coalesce((r_status.value ->> 'is_terminal')::boolean, false),
      coalesce((r_status.value ->> 'requires_review_role')::boolean, false)
    );
  end loop;

  -- ---- sections and their fields ----
  for r_section in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_spec -> 'sections', '[]'::jsonb)) with ordinality
  loop
    insert into public.case_type_sections (
      org_id, case_type_id, key, label, icon, description,
      tab_key, tab_label, tab_sort_order, sort_order, is_required, completion_rule
    ) values (
      p_org_id,
      v_case_type_id,
      r_section.value ->> 'key',
      r_section.value ->> 'label',
      coalesce(r_section.value ->> 'icon', 'circle'),
      r_section.value ->> 'description',
      coalesce(r_section.value ->> 'tab_key', 'documentation'),
      coalesce(r_section.value ->> 'tab_label', 'Documentation'),
      coalesce((r_section.value ->> 'tab_sort_order')::int, 0),
      coalesce((r_section.value ->> 'sort_order')::int, (r_section.ordinality - 1)::int),
      coalesce((r_section.value ->> 'is_required')::boolean, false),
      coalesce(
        (r_section.value ->> 'completion_rule')::public.completion_rule,
        'any_field_filled'::public.completion_rule
      )
    )
    returning id into v_section_id;

    for r_field in
      select value, ordinality
      from jsonb_array_elements(coalesce(r_section.value -> 'fields', '[]'::jsonb)) with ordinality
    loop
      insert into public.case_type_fields (
        org_id, section_id, key, label, field_type, options, validation,
        default_value, help_text, placeholder, width, sort_order
      ) values (
        p_org_id,
        v_section_id,
        r_field.value ->> 'key',
        r_field.value ->> 'label',
        coalesce((r_field.value ->> 'field_type')::public.field_type, 'text'::public.field_type),
        coalesce(r_field.value -> 'options', '{}'::jsonb),
        coalesce(r_field.value -> 'validation', '{}'::jsonb),
        r_field.value -> 'default_value',
        r_field.value ->> 'help_text',
        r_field.value ->> 'placeholder',
        coalesce(r_field.value ->> 'width', 'full'),
        coalesce((r_field.value ->> 'sort_order')::int, (r_field.ordinality - 1)::int)
      );
    end loop;
  end loop;

  -- ---- compliance checklists ----
  for r_checklist in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_spec -> 'checklists', '[]'::jsonb)) with ordinality
  loop
    insert into public.case_type_checklists (
      org_id, case_type_id, name, source_standard, version
    ) values (
      p_org_id,
      v_case_type_id,
      r_checklist.value ->> 'name',
      r_checklist.value ->> 'source_standard',
      r_checklist.value ->> 'version'
    )
    returning id into v_checklist_id;

    for r_item in
      select value, ordinality
      from jsonb_array_elements(coalesce(r_checklist.value -> 'items', '[]'::jsonb)) with ordinality
    loop
      insert into public.checklist_items (
        org_id, checklist_id, section_ref, label, help_text, sort_order, is_required
      ) values (
        p_org_id,
        v_checklist_id,
        r_item.value ->> 'section_ref',
        r_item.value ->> 'label',
        r_item.value ->> 'help_text',
        coalesce((r_item.value ->> 'sort_order')::int, (r_item.ordinality - 1)::int),
        coalesce((r_item.value ->> 'is_required')::boolean, true)
      );
    end loop;
  end loop;

  -- ---- report template ----
  for r_report in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_spec -> 'report_sections', '[]'::jsonb)) with ordinality
  loop
    select coalesce(jsonb_agg(s.id order by s.sort_order), '[]'::jsonb)
      into v_source_ids
    from jsonb_array_elements_text(
           coalesce(r_report.value -> 'source_section_keys', '[]'::jsonb)
         ) k
    join public.case_type_sections s
      on s.case_type_id = v_case_type_id and s.key = k.value;

    insert into public.case_type_report_sections (
      org_id, case_type_id, heading, sort_order, source_section_ids,
      draft_prompt, include_by_default
    ) values (
      p_org_id,
      v_case_type_id,
      r_report.value ->> 'heading',
      coalesce((r_report.value ->> 'sort_order')::int, (r_report.ordinality - 1)::int),
      coalesce(v_source_ids, '[]'::jsonb),
      r_report.value ->> 'draft_prompt',
      coalesce((r_report.value ->> 'include_by_default')::boolean, true)
    );
  end loop;

  return v_case_type_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Export a case type back to the portable spec shape.
-- -----------------------------------------------------------------------------
create or replace function public.export_case_type_template(p_case_type_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name',        ct.name,
    'slug',        ct.slug,
    'icon',        ct.icon,
    'color',       ct.color,
    'description', ct.description,

    'statuses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', s.key, 'label', s.label, 'color', s.color,
        'sort_order', s.sort_order,
        'is_initial', s.is_initial, 'is_terminal', s.is_terminal,
        'requires_review_role', s.requires_review_role
      ) order by s.sort_order), '[]'::jsonb)
      from public.case_statuses s where s.case_type_id = ct.id
    ),

    'sections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', sec.key, 'label', sec.label, 'icon', sec.icon,
        'description', sec.description,
        'tab_key', sec.tab_key, 'tab_label', sec.tab_label,
        'tab_sort_order', sec.tab_sort_order, 'sort_order', sec.sort_order,
        'is_required', sec.is_required,
        'completion_rule', sec.completion_rule,
        'fields', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'key', f.key, 'label', f.label, 'field_type', f.field_type,
            'options', f.options, 'validation', f.validation,
            'default_value', f.default_value,
            'help_text', f.help_text, 'placeholder', f.placeholder,
            'width', f.width, 'sort_order', f.sort_order
          ) order by f.sort_order), '[]'::jsonb)
          from public.case_type_fields f where f.section_id = sec.id
        )
      ) order by sec.sort_order), '[]'::jsonb)
      from public.case_type_sections sec where sec.case_type_id = ct.id
    ),

    'checklists', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', cl.name, 'source_standard', cl.source_standard, 'version', cl.version,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'section_ref', i.section_ref, 'label', i.label,
            'help_text', i.help_text, 'is_required', i.is_required,
            'sort_order', i.sort_order
          ) order by i.sort_order), '[]'::jsonb)
          from public.checklist_items i where i.checklist_id = cl.id
        )
      )), '[]'::jsonb)
      from public.case_type_checklists cl where cl.case_type_id = ct.id
    ),

    'report_sections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'heading', rs.heading, 'sort_order', rs.sort_order,
        'draft_prompt', rs.draft_prompt,
        'include_by_default', rs.include_by_default,
        'source_section_keys', (
          select coalesce(jsonb_agg(sec.key order by sec.sort_order), '[]'::jsonb)
          from jsonb_array_elements_text(rs.source_section_ids) sid
          join public.case_type_sections sec on sec.id = sid.value::uuid
        )
      ) order by rs.sort_order), '[]'::jsonb)
      from public.case_type_report_sections rs where rs.case_type_id = ct.id
    )
  ))
  from public.case_types ct
  where ct.id = p_case_type_id;
$$;

-- -----------------------------------------------------------------------------
-- Clone an existing case type as the starting point for a new one.
-- -----------------------------------------------------------------------------
create or replace function public.duplicate_case_type(
  p_case_type_id uuid,
  p_new_name     text,
  p_new_slug     text
)
returns uuid
language plpgsql
as $$
declare
  v_org_id uuid;
  v_spec   jsonb;
begin
  select org_id into v_org_id from public.case_types where id = p_case_type_id;
  if v_org_id is null then
    raise exception 'case type % not found', p_case_type_id;
  end if;

  v_spec := public.export_case_type_template(p_case_type_id)
            || jsonb_build_object('name', p_new_name, 'slug', p_new_slug);

  return public.install_case_type_template(v_org_id, v_spec);
end;
$$;

-- Functions default to EXECUTE for PUBLIC; keep the lockdown from 0012 in force
-- for the ones added after it.
revoke execute on function
  public.install_case_type_template(uuid, jsonb),
  public.export_case_type_template(uuid),
  public.duplicate_case_type(uuid, text, text)
from public, anon;

grant execute on function
  public.install_case_type_template(uuid, jsonb),
  public.export_case_type_template(uuid),
  public.duplicate_case_type(uuid, text, text)
to authenticated, service_role;
