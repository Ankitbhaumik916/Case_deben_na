-- =============================================================================
-- 0017 RICH TEXT IN LONG-FORM FIELDS
-- -----------------------------------------------------------------------------
-- Long-form fields now hold a small, fixed subset of HTML — paragraphs, bold,
-- italic, lists, headings — so an investigator can lay out a narrative the way
-- they would in a word processor.
--
-- That markup must not reach the search index. Without this, to_tsvector sees
-- the tag names as words: every case with a bolded phrase would match a search
-- for "strong", and every bulleted list a search for "li". Strip tags to
-- whitespace, and turn the handful of entities the editor emits back into the
-- characters they stand for, so "AT&T" is indexed as written rather than as
-- "amp".
--
-- Only the search text is touched. The stored value keeps its markup, and is
-- always sanitised again on the way out — the browser never trusts what it
-- reads back.
-- =============================================================================

create or replace function public.strip_markup(p_text text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(regexp_replace(coalesce(p_text, ''), '<[^>]*>', ' ', 'g'), '&nbsp;', ' '),
            '&amp;', '&'),
          '&lt;', '<'),
        '&gt;', '>'),
      '&quot;', '"'),
    '\s+', ' ', 'g'));
$$;

comment on function public.strip_markup(text) is
  'Plain text from the editor''s HTML subset, for indexing and previews.';

create or replace function public.jsonb_to_search_text(p_value jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_value is null then ''
    when jsonb_typeof(p_value) = 'string' then public.strip_markup(p_value #>> '{}')
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

grant execute on function public.strip_markup(text) to authenticated;

-- Existing cases were indexed with whatever they had; re-index so the change
-- applies to what is already stored rather than only to the next edit.
do $$
declare r record;
begin
  for r in select id from public.cases loop
    perform public.refresh_case_search(r.id);
  end loop;
end $$;
