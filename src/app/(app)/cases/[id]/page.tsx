import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { Badge, EmptyState } from '@/components/ui';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/icon';

export const metadata = { title: 'Case' };

/**
 * Read-only case view.
 *
 * Phase 5 turns this into the working case file — editable dynamic fields,
 * autosave, completion dots, the tab bar. For now it renders what the case type
 * configured and what has been recorded, which is enough for the list and the
 * create flow to land somewhere real instead of a 404.
 */
export default async function CasePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user.activeOrg) {
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

  const [{ data: sections }, { data: fields }, { data: values }] = await Promise.all([
    supabase
      .from('case_type_sections')
      .select('id, key, label, icon, sort_order')
      .eq('case_type_id', kase.case_type_id as string)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('case_type_fields')
      .select('id, section_id, label, field_type, options, validation, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('case_field_values').select('field_id, value').eq('case_id', params.id),
  ]);

  const valueOf = new Map((values ?? []).map((v) => [v.field_id as string, v.value]));
  const fieldsBySection = new Map<string, typeof fields>();
  for (const f of fields ?? []) {
    const key = f.section_id as string;
    if (!fieldsBySection.has(key)) fieldsBySection.set(key, []);
    fieldsBySection.get(key)!.push(f);
  }

  const answered = (values ?? []).filter((v) => isFilled(v.value)).length;

  return (
    <div className="space-y-5">
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
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
          <Meta label="Answered" value={String(answered)} />
        </dl>
      </header>

      <p className="rounded border border-edge bg-sunken px-3 py-2 text-sm text-ink-secondary">
        Read-only for now. Editing these fields, the completion dots and the tab bar arrive with
        the case workspace in phase 5 — the structure below is already coming from this case
        type&rsquo;s configuration, not from code.
      </p>

      {(sections ?? []).length === 0 ? (
        <EmptyState
          title="This case type has no sections yet"
          description="An administrator can add them in Admin → Case Types, and they will appear here immediately."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* sidebar */}
          <nav aria-label="Sections" className="lg:sticky lg:top-20 lg:self-start">
            <ul className="overflow-hidden rounded-lg border border-edge bg-raised">
              {(sections ?? []).map((s) => {
                const sectionFields = fieldsBySection.get(s.id as string) ?? [];
                const filled = sectionFields.filter((f) => isFilled(valueOf.get(f.id as string))).length;
                return (
                  <li key={s.id as string} className="border-b border-edge last:border-0">
                    <a
                      href={`#section-${s.key as string}`}
                      className="flex items-center gap-2 px-2.5 py-2 text-sm text-ink-secondary hover:bg-sunken hover:text-ink"
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            filled === 0
                              ? 'var(--border-strong)'
                              : filled === sectionFields.length
                                ? 'var(--success)'
                                : 'var(--accent)',
                        }}
                      />
                      <Icon name={s.icon as string} className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      <span className="min-w-0 flex-1 truncate">{s.label as string}</span>
                      <span className="tabular shrink-0 font-mono text-2xs text-ink-muted">
                        {filled}/{sectionFields.length}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* sections */}
          <div className="space-y-4">
            {(sections ?? []).map((s) => {
              const sectionFields = fieldsBySection.get(s.id as string) ?? [];
              return (
                <section
                  key={s.id as string}
                  id={`section-${s.key as string}`}
                  className="scroll-mt-20 overflow-hidden rounded-lg border border-edge bg-raised"
                >
                  <h2 className="flex items-center gap-2 border-b border-edge bg-sunken px-3 py-2 text-sm font-semibold text-ink">
                    <Icon name={s.icon as string} className="h-4 w-4 text-ink-secondary" />
                    {s.label as string}
                  </h2>

                  {sectionFields.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-ink-muted">No fields configured.</p>
                  ) : (
                    <dl className="divide-y divide-edge">
                      {sectionFields.map((f) => (
                        <div key={f.id as string} className="grid gap-1 px-3 py-2 sm:grid-cols-[200px_minmax(0,1fr)]">
                          <dt className="text-sm text-ink-secondary">
                            {f.label as string}
                            {(f.validation as Record<string, unknown> | null)?.required ? (
                              <span className="text-danger"> *</span>
                            ) : null}
                          </dt>
                          <dd className="text-sm text-ink">
                            {renderValue(f.field_type as string, valueOf.get(f.id as string))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="tabular mt-0.5 font-mono text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** Read-only rendering per field_type. The editable counterparts land in phase 5. */
function renderValue(type: string, value: unknown) {
  if (!isFilled(value)) {
    return <span className="text-ink-muted">Not recorded</span>;
  }

  if (type === 'boolean') return value === true ? 'Yes' : 'No';

  if (type === 'multiselect' && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v) => (
          <span
            key={String(v)}
            className="rounded-sm border border-edge bg-sunken px-1.5 py-0.5 text-xs text-ink-secondary"
          >
            {String(v)}
          </span>
        ))}
      </span>
    );
  }

  if (type === 'photo' || type === 'file' || type === 'signature') {
    return <span className="text-ink-muted">Attached (viewer arrives with the media library)</span>;
  }

  if (typeof value === 'object') {
    return <span className="font-mono text-xs text-ink-secondary">{JSON.stringify(value)}</span>;
  }

  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}
