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

export const metadata = { title: 'Case' };

export default async function CasePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const org = user.activeOrg;

  if (!org) {
    return <EmptyState icon={ShieldAlert} title="You are not a member of any organisation" />;
  }

  const supabase = createSupabaseServerClient();

  const { data: kase } = await supabase
    .from('case_list_view')
    .select(
      'id, case_number, title, address, city, county, state, created_at, incident_date, days_open, case_type_id, case_type_name, case_type_color, case_type_icon, status_label, status_color, lead_investigator_name, created_by_name',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!kase) notFound();

  const [{ data: sections }, { data: fields }, { data: values }, { data: people }, { data: manual }] =
    await Promise.all([
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

      <CaseWorkspace
        caseId={params.id}
        sections={sectionDefs}
        initialValues={initialValues}
        people={personOptions}
        canWrite={can.write(org.rank)}
      />
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
