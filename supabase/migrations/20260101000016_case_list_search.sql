-- =============================================================================
-- 0016 EXPOSE THE SEARCH VECTOR ON case_list_view
-- -----------------------------------------------------------------------------
-- The case list reads case_list_view (it needs the joined type, status and
-- investigator names, and days_open, which cannot be a generated column). The
-- search box has to match on people names and dynamic field values too, and
-- that lives in cases.search_tsv — maintained by the triggers in 0010.
--
-- Adding the column to the view lets PostgREST filter on it directly. It is a
-- filter target, not something the client selects: the app never reads the
-- vector, it only searches against it.
--
-- create or replace view may append columns but not reorder or drop them, so
-- these go on the end.
-- =============================================================================

create or replace view public.case_list_view
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
  greatest(0, (date_part('day', coalesce(c.closed_at, now()) - c.created_at))::int)
    as days_open,
  -- appended: search target only
  c.search_tsv
from public.cases c
join public.case_types ct on ct.id = c.case_type_id
left join public.case_statuses s on s.id = c.status_id
left join public.users lead on lead.id = c.lead_investigator_id
left join public.users creator on creator.id = c.created_by;

comment on view public.case_list_view is
  'Case list source. security_invoker, so the caller''s RLS applies. search_tsv is a filter target for the search box, not display data.';
