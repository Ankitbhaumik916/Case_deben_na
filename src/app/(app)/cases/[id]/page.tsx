import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { Badge, EmptyState } from '@/components/ui';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/icon';
import type { FieldDef, PersonOption } from '@/components/fields/DynamicField';
import { CaseWorkspace, type SectionDef } from './CaseWorkspace';
import { LocationCard } from './LocationCard';
import { EvidencePanel, type EvidenceItem } from './EvidencePanel';
import { LibraryPanel, type MediaFile, type MediaLog } from './LibraryPanel';
import { CaseDetailsCard, type CaseDetails, type OrgMember } from './CaseDetailsCard';
import { ChecklistPanel, type Checklist, type ChecklistItem } from './ChecklistPanel';

export const metadata = { title: 'Case' };

const TABS = [
  ['file', 'Case file'],
  ['library', 'Library'],
  ['custody', 'Chain of custody'],
  ['compliance', 'Compliance'],
] as const;

type TabKey = (typeof TABS)[number][0];

export default async function CasePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await requireUser();
  const org = user.activeOrg;

  if (!org) {
    return <EmptyState icon={ShieldAlert} title="You are not a member of any organisation" />;
  }

  const supabase = createSupabaseServerClient();

  const { data: kase } = await supabase
    .from('case_list_view')
    .select(
      'id, case_number, title, address, city, county, state, lat, lng, created_at, incident_date, days_open, case_type_id, case_type_name, case_type_color, case_type_icon, status_label, status_color, lead_investigator_name, created_by_name',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!kase) notFound();

  const [
    { data: sections },
    { data: fields },
    { data: values },
    { data: people },
    { data: manual },
    { data: evidence },
    { data: custody },
    { data: media },
    { data: mediaLogs },
    { data: raw },
    { data: members },
    { data: checklists },
    { data: checklistItems },
    { data: responses },
  ] = await Promise.all([
      supabase
        .from('case_type_sections')
        .select('id, key, label, icon, tab_key, tab_label, tab_sort_order, sort_order, is_required, completion_rule')
        .eq('case_type_id', kase.case_type_id as string)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('case_type_fields')
        .select('id, section_id, key, label, field_type, options, validation, help_text, placeholder, width, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('case_field_values').select('field_id, value').eq('case_id', params.id),
      supabase
        .from('case_people')
        .select('id, full_name, role')
        .eq('case_id', params.id)
        .order('full_name'),
      supabase
        .from('case_section_status')
        .select('section_id, is_complete')
        .eq('case_id', params.id),
      supabase
        .from('evidence_items')
        .select(
          'id, item_number, category, description, collected_from, collected_by, collected_at, exam_requested, current_status, current_location',
        )
        .eq('case_id', params.id)
        .order('item_number'),
      supabase
        .from('custody_events')
        .select('id, evidence_id, event_type, actor_name, location, occurred_at, notes')
        .order('occurred_at'),
      supabase
        .from('media_files')
        .select(
          'id, file_name, mime_type, size_bytes, caption, tags, captured_at, uploaded_at, storage_path, bucket, section_id, field_id, users ( full_name, email )',
        )
        .eq('case_id', params.id)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('media_log_reports')
        .select('id, title, media_ids, generated_at, users ( full_name, email )')
        .eq('case_id', params.id)
        .order('generated_at', { ascending: false }),
      // The view is shaped for reading; these are the columns the edit form
      // writes back, and two of them the view does not carry at all.
      supabase
        .from('cases')
        .select('address_line2, postal_code, lead_investigator_id')
        .eq('id', params.id)
        .maybeSingle(),
      supabase
        .from('users')
        .select('id, full_name, email')
        .eq('org_id', org.orgId)
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('case_type_checklists')
        .select('id, name, source_standard, version')
        .eq('case_type_id', kase.case_type_id as string)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('checklist_items')
        .select('id, checklist_id, label, help_text, section_ref, is_required, sort_order')
        .order('sort_order'),
      supabase
        .from('case_checklist_responses')
        .select('item_id, is_checked, completed_at, users ( full_name, email )')
        .eq('case_id', params.id),
    ]);

  const fieldsBySection = new Map<string, FieldDef[]>();
  for (const f of fields ?? []) {
    const key = f.section_id as string;
    if (!fieldsBySection.has(key)) fieldsBySection.set(key, []);
    const options = (f.options as Record<string, unknown> | null) ?? {};
    fieldsBySection.get(key)!.push({
      id: f.id as string,
      key: f.key as string,
      label: f.label as string,
      fieldType: f.field_type as string,
      helpText: (f.help_text as string | null) ?? null,
      placeholder: (f.placeholder as string | null) ?? null,
      width: (f.width as string) ?? 'full',
      required: Boolean((f.validation as Record<string, unknown> | null)?.required),
      choices: (options.choices as { value: string; label: string }[] | undefined) ?? [],
      options,
    });
  }

  const manualBySection = new Map(
    (manual ?? []).map((m) => [m.section_id as string, Boolean(m.is_complete)]),
  );

  // Tab order follows tab_sort_order, then the section order within it — the
  // tab bar is derived, never configured directly.
  const sectionDefs: SectionDef[] = (sections ?? [])
    .slice()
    .sort(
      (a, b) =>
        ((a.tab_sort_order as number) ?? 0) - ((b.tab_sort_order as number) ?? 0) ||
        ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0),
    )
    .map((s) => ({
      id: s.id as string,
      key: s.key as string,
      label: s.label as string,
      icon: (s.icon as string) ?? 'circle',
      tabKey: (s.tab_key as string) ?? 'documentation',
      tabLabel: (s.tab_label as string) ?? 'Documentation',
      isRequired: Boolean(s.is_required),
      completionRule: (s.completion_rule as string) ?? 'any_field_filled',
      manuallyComplete: manualBySection.get(s.id as string) ?? false,
      fields: fieldsBySection.get(s.id as string) ?? [],
    }));

  const initialValues = Object.fromEntries(
    (values ?? []).map((v) => [v.field_id as string, v.value]),
  );

  const eventsByItem = new Map<string, EvidenceItem['events']>();
  for (const e of custody ?? []) {
    const key = e.evidence_id as string;
    if (!eventsByItem.has(key)) eventsByItem.set(key, []);
    eventsByItem.get(key)!.push({
      id: e.id as string,
      eventType: e.event_type as string,
      actorName: e.actor_name as string,
      location: (e.location as string | null) ?? null,
      occurredAt: e.occurred_at as string,
      notes: (e.notes as string | null) ?? null,
    });
  }

  const evidenceItems: EvidenceItem[] = (evidence ?? []).map((e) => ({
    id: e.id as string,
    itemNumber: e.item_number as string,
    category: (e.category as string | null) ?? null,
    description: e.description as string,
    collectedFrom: (e.collected_from as string | null) ?? null,
    collectedBy: (e.collected_by as string | null) ?? null,
    collectedAt: (e.collected_at as string | null) ?? null,
    examRequested: (e.exam_requested as string | null) ?? null,
    currentStatus: (e.current_status as string) ?? 'in_custody',
    currentLocation: (e.current_location as string | null) ?? null,
    events: eventsByItem.get(e.id as string) ?? [],
  }));

  const caseDetails: CaseDetails = {
    caseNumber: (kase.case_number as string) ?? '',
    title: (kase.title as string | null) ?? '',
    address: (kase.address as string | null) ?? '',
    addressLine2: (raw?.address_line2 as string | null) ?? '',
    city: (kase.city as string | null) ?? '',
    county: (kase.county as string | null) ?? '',
    state: (kase.state as string | null) ?? '',
    postalCode: (raw?.postal_code as string | null) ?? '',
    incidentDate: ((kase.incident_date as string | null) ?? '').slice(0, 10),
    leadInvestigatorId: (raw?.lead_investigator_id as string | null) ?? '',
  };

  const orgMembers: OrgMember[] = (members ?? []).map((m) => ({
    id: m.id as string,
    name: (m.full_name as string | null) || (m.email as string),
  }));

  const responseByItem = new Map(
    (responses ?? []).map((r) => {
      const who = r.users as unknown as { full_name: string | null; email: string } | null;
      return [
        r.item_id as string,
        {
          checked: Boolean(r.is_checked),
          completedAt: (r.completed_at as string | null) ?? null,
          completedByName: who?.full_name ?? who?.email ?? null,
        },
      ];
    }),
  );

  // checklist_items is fetched for the whole org and grouped here rather than
  // queried per checklist — a handful of rows, one round trip instead of N.
  const itemsByChecklist = new Map<string, ChecklistItem[]>();
  for (const i of checklistItems ?? []) {
    const key = i.checklist_id as string;
    if (!itemsByChecklist.has(key)) itemsByChecklist.set(key, []);
    const r = responseByItem.get(i.id as string);
    itemsByChecklist.get(key)!.push({
      id: i.id as string,
      label: i.label as string,
      helpText: (i.help_text as string | null) ?? null,
      sectionRef: (i.section_ref as string | null) ?? null,
      isRequired: Boolean(i.is_required),
      checked: r?.checked ?? false,
      completedAt: r?.completedAt ?? null,
      completedByName: r?.completedByName ?? null,
    });
  }

  const caseChecklists: Checklist[] = (checklists ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    sourceStandard: (c.source_standard as string | null) ?? null,
    version: (c.version as string | null) ?? null,
    items: itemsByChecklist.get(c.id as string) ?? [],
  }));

  const checkTotal = caseChecklists.reduce((n, c) => n + c.items.length, 0);
  const checkDone = caseChecklists.reduce(
    (n, c) => n + c.items.filter((i) => i.checked).length,
    0,
  );

  // How many library files point at each field — what makes a photo or file
  // field answerable, and so what lets its section reach complete.
  const attachments: Record<string, number> = {};
  for (const m of media ?? []) {
    const fieldId = m.field_id as string | null;
    if (fieldId) attachments[fieldId] = (attachments[fieldId] ?? 0) + 1;
  }

  const tab = (TABS.find(([t]) => t === searchParams.tab)?.[0] ?? 'file') as TabKey;

  /*
   * The bucket is private, so every file needs a signed URL to be shown or
   * downloaded. Signing is a round trip to storage, and it is only worth making
   * when the library is the tab actually being looked at — the case file and
   * the custody ledger never touch these URLs.
   */
  const signedUrls = new Map<string, string>();
  if (tab === 'library' && (media ?? []).length > 0) {
    const { data: signed } = await supabase.storage
      .from('case-media')
      .createSignedUrls(
        (media ?? []).map((m) => m.storage_path as string),
        3600,
      );
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedUrls.set(s.path, s.signedUrl);
    }
  }

  const mediaFiles: MediaFile[] = (media ?? []).map((m) => {
    const uploader = m.users as unknown as { full_name: string | null; email: string } | null;
    return {
      id: m.id as string,
      fileName: m.file_name as string,
      mimeType: (m.mime_type as string | null) ?? null,
      sizeBytes: (m.size_bytes as number | null) ?? null,
      caption: (m.caption as string | null) ?? null,
      tags: ((m.tags as string[] | null) ?? []).map(String),
      capturedAt: (m.captured_at as string | null) ?? null,
      uploadedAt: m.uploaded_at as string,
      uploadedByName: uploader?.full_name ?? uploader?.email ?? null,
      storagePath: m.storage_path as string,
      url: signedUrls.get(m.storage_path as string) ?? null,
    };
  });

  const logDocs: MediaLog[] = (mediaLogs ?? []).map((l) => {
    const author = l.users as unknown as { full_name: string | null; email: string } | null;
    return {
      id: l.id as string,
      title: l.title as string,
      mediaIds: ((l.media_ids as string[] | null) ?? []).map(String),
      generatedAt: l.generated_at as string,
      generatedByName: author?.full_name ?? author?.email ?? null,
    };
  });

  const personOptions: PersonOption[] = (people ?? []).map((p) => ({
    id: p.id as string,
    fullName: p.full_name as string,
    role: (p.role as string) ?? 'contact',
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Cases
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${kase.case_type_color} 12%, transparent)`,
            color: kase.case_type_color as string,
          }}
        >
          <Icon name={kase.case_type_icon as string} className="h-5 w-5" />
        </span>

        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tabular font-mono text-2xl font-semibold text-ink">
              {kase.case_number as string}
            </h1>
            <StatusPill label={kase.status_label as string} color={kase.status_color as string} />
            <Badge>{kase.case_type_name as string}</Badge>
          </div>
          {kase.title ? <p className="mt-0.5 text-sm text-ink">{kase.title as string}</p> : null}
          <p className="mt-0.5 text-sm text-ink-secondary">
            {[kase.address, kase.city, kase.county, kase.state].filter(Boolean).join(', ') ||
              'No address recorded'}
          </p>
        </div>

        <dl className="flex gap-5">
          <Meta label="Days open" value={String(kase.days_open)} />
          <Meta label="Opened" value={(kase.created_at as string).slice(0, 10)} />
          {kase.lead_investigator_name ? (
            <Meta label="Lead" value={kase.lead_investigator_name as string} mono={false} />
          ) : null}
        </dl>
      </header>

      <nav aria-label="Case areas" className="flex gap-1 border-b border-edge">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/cases/${params.id}?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={
              tab === key
                ? '-mb-px border-b-2 border-accent px-3 py-2 text-sm font-medium text-ink'
                : '-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-ink-secondary transition-colors duration-150 hover:border-edge-strong hover:text-ink'
            }
          >
            {label}
            {key === 'custody' && evidenceItems.length > 0 ? (
              <span className="tabular ml-1.5 font-mono text-2xs text-ink-muted">
                {evidenceItems.length}
              </span>
            ) : null}
            {key === 'library' && mediaFiles.length > 0 ? (
              <span className="tabular ml-1.5 font-mono text-2xs text-ink-muted">
                {mediaFiles.length}
              </span>
            ) : null}
            {key === 'compliance' && checkTotal > 0 ? (
              <span className="tabular ml-1.5 font-mono text-2xs text-ink-muted">
                {checkDone}/{checkTotal}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === 'file' ? (
        <>
          <CaseDetailsCard
            caseId={params.id}
            details={caseDetails}
            members={orgMembers}
            canWrite={can.write(org.rank)}
          />

          <LocationCard
            caseId={params.id}
            address={[kase.address, kase.city, kase.county, kase.state].filter(Boolean).join(', ')}
            lat={kase.lat as number | null}
            lng={kase.lng as number | null}
            canWrite={can.write(org.rank)}
          />

          <CaseWorkspace
            caseId={params.id}
            sections={sectionDefs}
            initialValues={initialValues}
            people={personOptions}
            canWrite={can.write(org.rank)}
            attachments={attachments}
          />
        </>
      ) : tab === 'compliance' ? (
        <ChecklistPanel
          caseId={params.id}
          checklists={caseChecklists}
          canWrite={can.write(org.rank)}
        />
      ) : tab === 'library' ? (
        <LibraryPanel
          caseId={params.id}
          caseNumber={kase.case_number as string}
          files={mediaFiles}
          logs={logDocs}
          canWrite={can.write(org.rank)}
        />
      ) : (
        <EvidencePanel
          caseId={params.id}
          caseNumber={kase.case_number as string}
          items={evidenceItems}
          canWrite={can.write(org.rank)}
        />
      )}
    </div>
  );
}

function Meta({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={
          mono
            ? 'tabular mt-0.5 font-mono text-lg font-semibold text-ink'
            : 'mt-0.5 max-w-32 truncate text-sm font-medium text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}
