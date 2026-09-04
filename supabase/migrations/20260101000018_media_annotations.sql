-- =============================================================================
-- 0018 PHOTO MARK-UP
-- -----------------------------------------------------------------------------
-- Arrows, boxes and labels drawn on a case photograph — pointing at the seat of
-- a fire, ringing a tool mark, numbering items in a wide shot.
--
-- Stored as shapes beside the file, never burned into it. That is the whole
-- design: the uploaded photograph is the evidence and stays byte-for-byte what
-- was uploaded, while the mark-up is a separate, reversible layer that can be
-- corrected, removed, or shown and hidden. Flattening annotations into the
-- image would quietly replace an exhibit with an edited copy of itself.
--
-- Coordinates are fractions of the image's own width and height, so the same
-- mark-up lines up at any display size and in print.
-- =============================================================================

alter table public.media_files
  add column if not exists annotations jsonb not null default '[]'::jsonb;

alter table public.media_files
  drop constraint if exists media_files_annotations_array;

alter table public.media_files
  add constraint media_files_annotations_array
  check (jsonb_typeof(annotations) = 'array');

comment on column public.media_files.annotations is
  'Mark-up shapes in image-relative coordinates. The file itself is never altered.';

-- Only worth an index if we ever ask "which photographs carry mark-up", which
-- the report builder will. Partial, so it stays small.
create index if not exists media_files_annotated_idx
  on public.media_files (case_id)
  where jsonb_array_length(annotations) > 0;
