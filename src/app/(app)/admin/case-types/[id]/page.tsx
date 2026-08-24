import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { Badge, EmptyState } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { SectionsEditor, type SectionRow } from './SectionsEditor';
import { TemplatePreview } from './TemplatePreview';
import { StatusesEditor, type StatusRow } from './StatusesEditor';
import { ChecklistEditor, type ChecklistRow } from './ChecklistEditor';
import { ReportTemplateEditor, type ReportSectionRow } from './ReportTemplateEditor';

export const metadata = { title: 'Edit case type' };

const TABS = [
  ['sections', 'Sections'],
  ['statuses', 'Statuses'],
  ['checklist', 'Checklist'],
  ['report', 'Report template'],
] as const;

type TabKey = (typeof TABS)[number][0];

export default async function CaseTypeEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await requireUser();
  const org = user.activeOrg;

  if (!org || !can.admin(org.rank)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrator access required"
        description="Only administrators can change what a case type collects."
      />
    );
  }

  const tab: TabKey = (TABS.find(([k]) => k === searchParams.tab)?.[0] ?? 'sections') as TabKey;
  const supabase = createSupabaseServerClient();

  const { data: caseType } = await supabase
    .from('case_types')
    .select('id, name, slug, description, icon, color, is_active')
    .eq('id', params.id)
    .maybeSingle();

  if (!caseType) notFound();

  const [
    { data: sections },
    { data: fields },
    { data: statusRows },
    { data: caseRows },
    { data: checklists },
    { data: checklistItems },
    { data: reportSections },
  ] = await Promise.all([
    supabase
      .from('case_type_sections')
      .select('id, key, label, icon, tab_key, tab_label, sort_order, is_required, completion_rule')
      .eq('case_type_id', params.id)
      .order('sort_order'),
    supabase
      .from('case_type_fields')
      .select('id, section_id, key, label, field_type, options, validation, help_text, width, sort_order')
      .order('sort_order'),
    supabase
      .from('case_statuses')
      .select('id, key, label, color, sort_order, is_initial, is_terminal, requires_review_role, case_type_id')
      .order('sort_order'),
    supabase.from('cases').select('id, status_id, case_type_id'),
    supabase
      .from('case_type_checklists')
      .select('id, name, source_standard, version')
      .eq('case_type_id', params.id)
      .order('created_at'),
    supabase.from('checklist_items').select('id, checklist_id, label, section_ref, is_required, sort_order').order('sort_order'),
    supabase
      .from('case_type_report_sections')
      .select('id, heading, draft_prompt, include_by_default, source_section_ids, sort_order')
      .eq('case_type_id', params.id)
      .order('sort_order'),
  ]);

  /* ---------- sections + fields ---------- */
  const fieldsBySection = new Map<string, SectionRow['fields']>();
  for (const f of fields ?? []) {
    const key = f.section_id as string;
    if (!fieldsBySection.has(key)) fieldsBySection.set(key, []);
    fieldsBySection.get(key)!.push({
      id: f.id as string,
      key: f.key as string,
      label: f.label as string,
      fieldType: f.field_type as string,
      helpText: (f.help_text as string | null) ?? null,
      width: (f.width as string) ?? 'full',
      required: Boolean((f.validation as Record<string, unknown> | null)?.required),
      choices:
        ((f.options as Record<string, unknown> | null)?.choices as
          | { value: string; label: string }[]
          | undefined) ?? [],
    });
  }

  const sectionRows: SectionRow[] = (sections ?? []).map((s) => ({
    id: s.id as string,
    key: s.key as string,
    label: s.label as string,
    icon: (s.icon as string) ?? 'circle',
    tabKey: (s.tab_key as string) ?? 'documentation',
    tabLabel: (s.tab_label as string) ?? 'Documentation',
    isRequired: Boolean(s.is_required),
    completionRule: (s.completion_rule as string) ?? 'any_field_filled',
    fields: fieldsBySection.get(s.id as string) ?? [],
  }));

  /* ---------- statuses ---------- */
  const casesPerStatus = new Map<string, number>();
  for (const c of caseRows ?? []) {
    const key = c.status_id as string | null;
    if (key) casesPerStatus.set(key, (casesPerStatus.get(key) ?? 0) + 1);
  }

  const toStatus = (s: Record<string, unknown>): StatusRow => ({
    id: s.id as string,
    key: s.key as string,
    label: s.label as string,
    color: (s.color as string) ?? '#64748b',
    isInitial: Boolean(s.is_initial),
    isTerminal: Boolean(s.is_terminal),
    requiresReview: Boolean(s.requires_review_role),
    caseCount: casesPerStatus.get(s.id as string) ?? 0,
  });

  const ownStatuses = (statusRows ?? []).filter((s) => s.case_type_id === params.id).map(toStatus);
  const inheritedStatuses = (statusRows ?? []).filter((s) => s.case_type_id === null).map(toStatus);

  /* ---------- checklists ---------- */
  const itemsByChecklist = new Map<string, ChecklistRow['items']>();
  for (const i of checklistItems ?? []) {
    const key = i.checklist_id as string;
    if (!itemsByChecklist.has(key)) itemsByChecklist.set(key, []);
    itemsByChecklist.get(key)!.push({
      id: i.id as string,
      label: i.label as string,
      sectionRef: (i.section_ref as string | null) ?? null,
      isRequired: Boolean(i.is_required),
    });
  }

  const checklistRows: ChecklistRow[] = (checklists ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    sourceStandard: (c.source_standard as string | null) ?? null,
    version: (c.version as string | null) ?? null,
    items: itemsByChecklist.get(c.id as string) ?? [],
  }));

  /* ---------- report template ---------- */
  const reportRows: ReportSectionRow[] = (reportSections ?? []).map((r) => ({
    id: r.id as string,
    heading: r.heading as string,
    draftPrompt: (r.draft_prompt as string | null) ?? null,
    includeByDefault: Boolean(r.include_by_default),
    sourceSectionIds: Array.isArray(r.source_section_ids)
      ? (r.source_section_ids as string[])
      : [],
  }));

  const fieldTotal = sectionRows.reduce((n, s) => n + s.fields.length, 0);
  const caseCount = (caseRows ?? []).filter((c) => c.case_type_id === params.id).length;

  const counts: Record<TabKey, number> = {
    sections: sectionRows.length,
    statuses: ownStatuses.length || inheritedStatuses.length,
    checklist: checklistRows.reduce((n, c) => n + c.items.length, 0),
    report: reportRows.length,
  };

  return (
    <div className="space-y-5">
      <Link
        href="/admin/case-types"
        className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All case types
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${caseType.color} 12%, transparent)`,
            color: caseType.color as string,
          }}
        >
          <Icon name={caseType.icon as string} className="h-5 w-5" />
        </span>

        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">{caseType.name as string}</h1>
            {!caseType.is_active ? <Badge>Inactive</Badge> : null}
          </div>
          <p className="tabular mt-0.5 font-mono text-xs text-ink-muted">
            {caseType.slug as string} · {sectionRows.length} section
            {sectionRows.length === 1 ? '' : 's'} · {fieldTotal} field
            {fieldTotal === 1 ? '' : 's'} · {caseCount} case{caseCount === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {caseCount > 0 ? (
        <p className="rounded border border-edge bg-sunken px-3 py-2 text-sm text-ink-secondary">
          {caseCount} case{caseCount === 1 ? ' uses' : 's use'} this type. Adding to the template is
          safe — existing cases simply show the new parts unanswered. Removing something that
          cases have already answered is blocked, with the count, rather than silently
          destroying the record.
        </p>
      ) : null}

      {/* ---------- tabs ---------- */}
      <nav aria-label="Case type settings" className="flex gap-1 border-b border-edge">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/case-types/${params.id}?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-150',
              tab === key
                ? 'border-accent font-medium text-ink'
                : 'border-transparent text-ink-secondary hover:border-edge-strong hover:text-ink',
            )}
          >
            {label}
            <span className="tabular ml-1.5 font-mono text-2xs text-ink-muted">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {/* ---------- active tab ---------- */}
      {tab === 'sections' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <SectionsEditor caseTypeId={params.id} sections={sectionRows} />
          <TemplatePreview caseTypeName={caseType.name as string} sections={sectionRows} />
        </div>
      ) : null}

      {tab === 'statuses' ? (
        <StatusesEditor
          caseTypeId={params.id}
          statuses={ownStatuses}
          inherited={inheritedStatuses}
        />
      ) : null}

      {tab === 'checklist' ? (
        <ChecklistEditor
          caseTypeId={params.id}
          checklists={checklistRows}
          sections={sectionRows.map((s) => ({ key: s.key, label: s.label }))}
        />
      ) : null}

      {tab === 'report' ? (
        <ReportTemplateEditor
          caseTypeId={params.id}
          reportSections={reportRows}
          sections={sectionRows.map((s) => ({ id: s.id, label: s.label }))}
        />
      ) : null}
    </div>
  );
}
