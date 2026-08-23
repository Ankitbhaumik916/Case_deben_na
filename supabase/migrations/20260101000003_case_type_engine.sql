-- =============================================================================
-- 0003 NO-CODE CASE TYPE ENGINE
-- -----------------------------------------------------------------------------
-- Everything an admin configures for a discipline lives here. A new case type
-- (burglary, homicide, signature forensics, ...) is rows in these tables and
-- requires no application code.
-- =============================================================================

create table public.case_types (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  icon        text not null default 'folder',
  color       text not null default '#2563eb',
  is_active   boolean not null default true,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint case_types_org_slug_key unique (org_id, slug),
  constraint case_types_id_org_key unique (id, org_id),
  constraint case_types_color_hex check (color ~* '^#[0-9a-f]{6}$'),
  constraint case_types_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index case_types_org_idx on public.case_types (org_id) where is_active;

create trigger case_types_set_updated_at
  before update on public.case_types
  for each row execute function public.set_updated_at();

-- ---------- sections --------------------------------------------------------
-- One row per entry in the case-detail left sidebar. tab_key groups sections
-- into the horizontal tab bar; the tab set is DERIVED from distinct tab_key
-- values, so admins create tabs implicitly by naming one.
create table public.case_type_sections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  case_type_id    uuid not null,
  key             text not null,
  label           text not null,
  icon            text not null default 'circle',
  description     text,
  tab_key         text not null default 'documentation',
  tab_label       text not null default 'Documentation',
  tab_sort_order  int  not null default 0,
  sort_order      int  not null default 0,
  is_required     boolean not null default false,
  completion_rule public.completion_rule not null default 'any_field_filled',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint case_type_sections_id_org_key unique (id, org_id),
  constraint case_type_sections_type_key_key unique (case_type_id, key),
  constraint case_type_sections_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete cascade,
  constraint case_type_sections_key_format check (key ~ '^[a-z0-9_]+$')
);

create index case_type_sections_type_idx
  on public.case_type_sections (case_type_id, sort_order);

create trigger case_type_sections_inherit_org
  before insert on public.case_type_sections
  for each row execute function public.inherit_org_id('public.case_types', 'case_type_id');

create trigger case_type_sections_set_updated_at
  before update on public.case_type_sections
  for each row execute function public.set_updated_at();

-- ---------- fields ----------------------------------------------------------
-- options   : select/multiselect choices, computed expressions, person_ref role
--             filters, accepted mime types for file/photo, ...
-- validation: zod-shaped config -> { required, min, max, minLength, maxLength,
--             regex, message }
create table public.case_type_fields (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  section_id    uuid not null,
  key           text not null,
  label         text not null,
  field_type    public.field_type not null default 'text',
  options       jsonb not null default '{}'::jsonb,
  validation    jsonb not null default '{}'::jsonb,
  default_value jsonb,
  help_text     text,
  placeholder   text,
  width         text not null default 'full',
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint case_type_fields_id_org_key unique (id, org_id),
  constraint case_type_fields_section_key_key unique (section_id, key),
  constraint case_type_fields_section_fkey
    foreign key (section_id, org_id)
    references public.case_type_sections (id, org_id) on delete cascade,
  constraint case_type_fields_key_format check (key ~ '^[a-z0-9_]+$'),
  constraint case_type_fields_width_valid check (width in ('full', 'half', 'third')),
  constraint case_type_fields_options_object check (jsonb_typeof(options) = 'object'),
  constraint case_type_fields_validation_object check (jsonb_typeof(validation) = 'object')
);

create index case_type_fields_section_idx
  on public.case_type_fields (section_id, sort_order);

create trigger case_type_fields_inherit_org
  before insert on public.case_type_fields
  for each row execute function public.inherit_org_id('public.case_type_sections', 'section_id');

create trigger case_type_fields_set_updated_at
  before update on public.case_type_fields
  for each row execute function public.set_updated_at();

-- ---------- statuses --------------------------------------------------------
-- case_type_id NULL = org-wide default status set, inherited by any case type
-- that does not define its own.
create table public.case_statuses (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  case_type_id         uuid,
  key                  text not null,
  label                text not null,
  color                text not null default '#64748b',
  sort_order           int  not null default 0,
  is_initial           boolean not null default false,
  is_terminal          boolean not null default false,
  -- transitions INTO this status require reviewer or above (approved / filed)
  requires_review_role boolean not null default false,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint case_statuses_id_org_key unique (id, org_id),
  constraint case_statuses_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete cascade,
  constraint case_statuses_color_hex check (color ~* '^#[0-9a-f]{6}$'),
  constraint case_statuses_key_format check (key ~ '^[a-z0-9_]+$')
);

-- NULL case_type_id must still collide with itself, hence the coalesce.
create unique index case_statuses_scope_key_idx
  on public.case_statuses (
    org_id,
    coalesce(case_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

create index case_statuses_lookup_idx
  on public.case_statuses (org_id, case_type_id, sort_order);

create trigger case_statuses_set_updated_at
  before update on public.case_statuses
  for each row execute function public.set_updated_at();

-- ---------- compliance checklists -------------------------------------------
create table public.case_type_checklists (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  case_type_id    uuid not null,
  name            text not null,
  source_standard text,
  version         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint case_type_checklists_id_org_key unique (id, org_id),
  constraint case_type_checklists_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete cascade
);

create index case_type_checklists_type_idx
  on public.case_type_checklists (case_type_id) where is_active;

create trigger case_type_checklists_inherit_org
  before insert on public.case_type_checklists
  for each row execute function public.inherit_org_id('public.case_types', 'case_type_id');

create trigger case_type_checklists_set_updated_at
  before update on public.case_type_checklists
  for each row execute function public.set_updated_at();

-- section_ref is the case_type_sections.key this item is grouped under in the
-- checklist UI (nullable: an item need not map to a section).
create table public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  checklist_id uuid not null,
  section_ref  text,
  label        text not null,
  help_text    text,
  sort_order   int  not null default 0,
  is_required  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint checklist_items_id_org_key unique (id, org_id),
  constraint checklist_items_checklist_fkey
    foreign key (checklist_id, org_id)
    references public.case_type_checklists (id, org_id) on delete cascade
);

create index checklist_items_checklist_idx
  on public.checklist_items (checklist_id, sort_order);

create trigger checklist_items_inherit_org
  before insert on public.checklist_items
  for each row execute function public.inherit_org_id('public.case_type_checklists', 'checklist_id');

create trigger checklist_items_set_updated_at
  before update on public.checklist_items
  for each row execute function public.set_updated_at();

-- ---------- report template -------------------------------------------------
-- source_section_ids: jsonb array of case_type_sections.id whose field values
-- are fed to the AI drafting prompt for this report section.
create table public.case_type_report_sections (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  case_type_id       uuid not null,
  heading            text not null,
  sort_order         int  not null default 0,
  source_section_ids jsonb not null default '[]'::jsonb,
  draft_prompt       text,
  include_by_default boolean not null default true,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint case_type_report_sections_id_org_key unique (id, org_id),
  constraint case_type_report_sections_case_type_fkey
    foreign key (case_type_id, org_id)
    references public.case_types (id, org_id) on delete cascade,
  constraint case_type_report_sections_sources_array
    check (jsonb_typeof(source_section_ids) = 'array')
);

create index case_type_report_sections_type_idx
  on public.case_type_report_sections (case_type_id, sort_order);

create trigger case_type_report_sections_inherit_org
  before insert on public.case_type_report_sections
  for each row execute function public.inherit_org_id('public.case_types', 'case_type_id');

create trigger case_type_report_sections_set_updated_at
  before update on public.case_type_report_sections
  for each row execute function public.set_updated_at();
