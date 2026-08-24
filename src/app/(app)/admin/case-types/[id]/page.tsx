import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { Badge, EmptyState } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { SectionsEditor, type SectionRow } from './SectionsEditor';
import { TemplatePreview } from './TemplatePreview';

export const metadata = { title: 'Edit case type' };

export default async function CaseTypeEditorPage({ params }: { params: { id: string } }) {
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

  const supabase = createSupabaseServerClient();

  const { data: caseType } = await supabase
    .from('case_types')
    .select('id, name, slug, description, icon, color, is_active')
    .eq('id', params.id)
    .maybeSingle();

  if (!caseType) notFound();

  const [{ data: sections }, { data: fields }, { count: caseCount }] = await Promise.all([
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
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('case_type_id', params.id),
  ]);

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

  const rows: SectionRow[] = (sections ?? []).map((s) => ({
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

  const fieldTotal = rows.reduce((n, s) => n + s.fields.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/case-types"
          className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All case types
        </Link>
      </div>

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
            {caseType.slug as string} · {rows.length} section{rows.length === 1 ? '' : 's'} ·{' '}
            {fieldTotal} field{fieldTotal === 1 ? '' : 's'} · {caseCount ?? 0} case
            {(caseCount ?? 0) === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {(caseCount ?? 0) > 0 ? (
        <p className="rounded border border-edge bg-sunken px-3 py-2 text-sm text-ink-secondary">
          {caseCount} case{(caseCount ?? 0) === 1 ? ' uses' : 's use'} this type. Adding sections and
          fields is safe — existing cases simply show them unanswered. Removing one deletes the
          answers already recorded against it, so those actions are blocked while data exists.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <SectionsEditor caseTypeId={params.id} sections={rows} />
        <TemplatePreview caseTypeName={caseType.name as string} sections={rows} />
      </div>
    </div>
  );
}
