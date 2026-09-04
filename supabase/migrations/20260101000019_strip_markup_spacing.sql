-- =============================================================================
-- 0019 STRIP_MARKUP: SPACE AT BLOCK EDGES ONLY
-- -----------------------------------------------------------------------------
-- 0017 replaced every tag with a space, which is right for a block boundary and
-- wrong inside a sentence: "fire <strong>confirmed</strong>." came back as
-- "fire confirmed ." with the full stop adrift. Harmless for the search index,
-- which ignores punctuation, but this function is also the plain-text form of a
-- narrative, and it disagreed with richTextToPlain() in the browser — two
-- answers to the same question is a bug waiting for whichever one is trusted.
--
-- Close a block, get a space. Everything else is removed without one.
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
            replace(
              -- Inline tags go without a trace; block edges become whitespace.
              regexp_replace(
                regexp_replace(
                  coalesce(p_text, ''),
                  '</?(p|br|li|h3|h4|blockquote|ul|ol|div)[^>]*>', ' ', 'gi'),
                '<[^>]*>', '', 'g'),
              '&nbsp;', ' '),
            '&amp;', '&'),
          '&lt;', '<'),
        '&gt;', '>'),
      '&quot;', '"'),
    '\s+', ' ', 'g'));
$$;

do $$
declare r record;
begin
  for r in select id from public.cases loop
    perform public.refresh_case_search(r.id);
  end loop;
end $$;
