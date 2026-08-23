-- =============================================================================
-- 0007 INTERVIEWS / STATEMENTS
-- =============================================================================

create table public.interviews (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null,
  case_id              uuid not null,
  subject_name         text not null,
  subject_person_id    uuid,
  conducted_by         text,
  conducted_by_id      uuid references public.users (id) on delete set null,
  interview_date       timestamptz,
  location             text,

  -- audio / video source
  bucket               text not null default 'case-audio',
  audio_path           text,
  audio_mime           text,
  duration_seconds     numeric,

  -- transcription
  transcript           text,
  transcript_status    public.transcript_status not null default 'not_started',
  transcript_error     text,
  transcript_updated_at timestamptz,

  -- human-written supplement (rich text)
  narrative            text,

  -- AI summary
  ai_summary           text,
  ai_summary_type      public.summary_length,
  ai_summary_generated_at timestamptz,

  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint interviews_id_org_key unique (id, org_id),
  constraint interviews_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade,
  constraint interviews_person_fkey
    foreign key (subject_person_id, org_id)
    references public.case_people (id, org_id) on delete set null,
  constraint interviews_failed_has_reason
    check (transcript_status <> 'failed' or transcript_error is not null)
);

create index interviews_case_idx on public.interviews (case_id, interview_date desc);
create index interviews_status_idx on public.interviews (transcript_status)
  where transcript_status in ('pending', 'processing');

create trigger interviews_inherit_org
  before insert on public.interviews
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

-- Stamp transcript_updated_at whenever the transcript itself changes, so the
-- UI can show "transcribed 4 minutes ago" without a separate job table.
create or replace function public.touch_transcript_timestamp()
returns trigger
language plpgsql
as $$
begin
  if new.transcript is distinct from old.transcript
     or new.transcript_status is distinct from old.transcript_status then
    new.transcript_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger interviews_touch_transcript
  before update on public.interviews
  for each row execute function public.touch_transcript_timestamp();
