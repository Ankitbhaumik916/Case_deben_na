-- =============================================================================
-- 0008 REPORTS
-- =============================================================================

-- Working copy of the narrative for each report section of a case. Survives
-- across report versions: generating a PDF snapshots these into
-- report_section_status, it does not consume them.
create table public.case_report_section_drafts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  case_id           uuid not null,
  report_section_id uuid not null,
  content           text,
  is_included       boolean not null default true,
  is_ai_generated   boolean not null default false,
  edited_by         uuid references public.users (id) on delete set null,
  generated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint case_report_section_drafts_unique unique (case_id, report_section_id),
  constraint case_report_section_drafts_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint case_report_section_drafts_section_fkey
    foreign key (report_section_id, org_id)
    references public.case_type_report_sections (id, org_id) on delete cascade
);

create index case_report_section_drafts_case_idx
  on public.case_report_section_drafts (case_id);

create trigger case_report_section_drafts_inherit_org
  before insert on public.case_report_section_drafts
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger case_report_section_drafts_set_updated_at
  before update on public.case_report_section_drafts
  for each row execute function public.set_updated_at();

-- One row per generated PDF. Versions are immutable and kept downloadable.
create table public.reports (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  case_id            uuid not null,
  version            int not null,
  status             public.report_status not null default 'draft',
  title              text,
  bucket             text not null default 'case-reports',
  generated_pdf_path text,
  generated_by       uuid references public.users (id) on delete set null,
  generated_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint reports_id_org_key unique (id, org_id),
  constraint reports_case_version_key unique (case_id, version),
  constraint reports_version_positive check (version > 0),
  constraint reports_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade
);

create index reports_case_idx on public.reports (case_id, version desc);

create trigger reports_inherit_org
  before insert on public.reports
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- Auto-increment version per case, so callers never race on max(version)+1.
create or replace function public.apply_report_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
    from public.reports
    where case_id = new.case_id;
  end if;
  return new;
end;
$$;

-- BEFORE INSERT triggers fire ahead of the NOT NULL check, so callers may omit
-- version entirely and let this fill it in.
create trigger reports_apply_version
  before insert on public.reports
  for each row execute function public.apply_report_version();

-- Per-version snapshot: which sections were included and what they said.
create table public.report_section_status (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  report_id         uuid not null,
  report_section_id uuid,
  status            public.report_section_state not null default 'incomplete',
  heading_snapshot  text,
  content_snapshot  text,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  constraint report_section_status_unique unique (report_id, report_section_id),
  constraint report_section_status_report_fkey
    foreign key (report_id, org_id)
    references public.reports (id, org_id) on delete cascade,
  constraint report_section_status_section_fkey
    foreign key (report_section_id, org_id)
    references public.case_type_report_sections (id, org_id) on delete set null
);

create index report_section_status_report_idx
  on public.report_section_status (report_id, sort_order);

create trigger report_section_status_inherit_org
  before insert on public.report_section_status
  for each row execute function public.inherit_org_id('public.reports', 'report_id');
