-- =============================================================================
-- 0005 EVIDENCE & CHAIN OF CUSTODY
-- =============================================================================

create table public.evidence_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  case_id          uuid not null,
  item_number      text not null,
  category         text,
  description      text not null,
  collected_from   text,
  collected_at     timestamptz,
  collected_by     text,
  collected_by_id  uuid references public.users (id) on delete set null,
  exam_requested   text,
  current_status   text not null default 'in_custody',
  current_location text,
  disposition      text,
  notes            text,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint evidence_items_id_org_key unique (id, org_id),
  constraint evidence_items_case_number_key unique (case_id, item_number),
  constraint evidence_items_case_fkey
    foreign key (case_id, org_id)
    references public.cases (id, org_id) on delete cascade
);

create index evidence_items_case_idx on public.evidence_items (case_id);

create trigger evidence_items_inherit_org
  before insert on public.evidence_items
  for each row execute function public.inherit_org_id('public.cases', 'case_id');

create trigger evidence_items_set_updated_at
  before update on public.evidence_items
  for each row execute function public.set_updated_at();

-- The custody ledger. Append-mostly: entries can be corrected, but the full
-- chronological chain is what the chain-of-custody PDF is rendered from.
create table public.custody_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  evidence_id   uuid not null,
  event_type    public.custody_event_type not null,
  actor_name    text not null,
  actor_user_id uuid references public.users (id) on delete set null,
  location      text,
  occurred_at   timestamptz not null default now(),
  notes         text,
  recorded_by   uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint custody_events_evidence_fkey
    foreign key (evidence_id, org_id)
    references public.evidence_items (id, org_id) on delete cascade
);

create index custody_events_evidence_idx
  on public.custody_events (evidence_id, occurred_at desc);

create trigger custody_events_inherit_org
  before insert on public.custody_events
  for each row execute function public.inherit_org_id('public.evidence_items', 'evidence_id');

create trigger custody_events_set_updated_at
  before update on public.custody_events
  for each row execute function public.set_updated_at();

-- Keep the item's headline status/location in step with the newest ledger entry
-- so the evidence table never contradicts the timeline beneath it.
create or replace function public.sync_evidence_current_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evidence_id uuid := coalesce(new.evidence_id, old.evidence_id);
  v_latest public.custody_events%rowtype;
begin
  select * into v_latest
  from public.custody_events
  where evidence_id = v_evidence_id
  order by occurred_at desc, created_at desc
  limit 1;

  if found then
    update public.evidence_items
       set current_status   = v_latest.event_type::text,
           current_location = coalesce(v_latest.location, current_location),
           updated_at       = now()
     where id = v_evidence_id;
  end if;

  return null;
end;
$$;

create trigger custody_events_sync_evidence
  after insert or update or delete on public.custody_events
  for each row execute function public.sync_evidence_current_state();
