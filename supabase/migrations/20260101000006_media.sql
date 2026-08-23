-- =============================================================================
-- 0006 CASE LIBRARY / MEDIA
-- =============================================================================

-- section_id / field_id are optional back-references: a file uploaded through a
-- photo or file field on a dynamic section links back to it, while files added
-- straight to the library have neither.
create table public.media_files (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  case_id          uuid not null,
  section_id       uuid,
  field_id         uuid,
  bucket           text not null default 'case-media',
  storage_path     text not null,
  file_name        text not null,
  mime_type        text,
  size_bytes       bigint,
  width            int,
  height           int,
  duration_seconds numeric,
  caption          text,
  tags             jsonb not null default '[]'::jsonb,
  captured_at      timestamptz,
  uploaded_by      uuid references public.users (id) on delete set null,
  uploaded_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint media_files_id_org_key unique (id, org_id),
  constraint media_files_storage_path_key unique (bucket, storage_path),
  constraint media_files_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint media_files_section_fkey
    foreign key (section_id, org_id)
    references public.case_type_sections (id, org_id) on delete set null,
  constraint media_files_field_fkey
    foreign key (field_id, org_id)
    references public.case_type_fields (id, org_id) on delete set null,
  constraint media_files_tags_array check (jsonb_typeof(tags) = 'array')
);

create index media_files_case_idx on public.media_files (case_id, uploaded_at desc);
create index media_files_section_idx on public.media_files (section_id);
create index media_files_tags_idx on public.media_files using gin (tags);

create trigger media_files_inherit_org
  before insert on public.media_files
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger media_files_set_updated_at
  before update on public.media_files
  for each row execute function public.set_updated_at();

-- A generated "media log" document over a chosen set of files.
create table public.media_log_reports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  case_id      uuid not null,
  title        text not null,
  media_ids    jsonb not null default '[]'::jsonb,
  bucket       text not null default 'case-reports',
  storage_path text,
  generated_by uuid references public.users (id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint media_log_reports_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint media_log_reports_media_ids_array check (jsonb_typeof(media_ids) = 'array')
);

create index media_log_reports_case_idx
  on public.media_log_reports (case_id, generated_at desc);

create trigger media_log_reports_inherit_org
  before insert on public.media_log_reports
  for each row execute function public.inherit_org_id('public.cases', 'case_id');
