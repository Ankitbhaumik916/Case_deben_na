import Link from 'next/link';
import { ArrowLeft, Layers, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { EmptyState } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { NewCaseForm } from './NewCaseForm';

export const metadata = { title: 'New case' };

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const user = await requireUser();
  const org = user.activeOrg;

  if (!org) {
    return <EmptyState icon={ShieldAlert} title="You are not a member of any organisation" />;
  }

  if (!can.write(org.rank)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Read-only access"
        description="Creating a case needs the investigator role. An administrator can change that for you."
      />
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: types } = await supabase
    .from('case_types')
    .select('id, name, slug, description, icon, color')
    .eq('org_id', org.orgId)
    .eq('is_active', true)
    .order('name');

  const chosen = (types ?? []).find((t) => t.slug === searchParams.type);

  /* ---------- step 1: which discipline ---------- */
  if (!chosen) {
    return (
      <div className="space-y-5">
        <Link
          href="/cases"
          className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Cases
        </Link>

        <header>
          <h1 className="text-2xl font-semibold text-ink">What kind of case?</h1>
          <p className="mt-1 max-w-prose text-sm text-ink-secondary">
            The type decides the sections, fields, status pipeline and report structure this
            case will use. It can be changed later only by an administrator, so pick the
            discipline that fits.
          </p>
        </header>

        {(types ?? []).length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No active case types"
            description={
              can.admin(org.rank)
                ? 'Create one in Admin → Case Types, then come back.'
                : 'An administrator needs to configure a case type first.'
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(types ?? []).map((t) => (
              <li key={t.id as string}>
                <Link
                  href={`/cases/new?type=${t.slug as string}`}
                  className="flex h-full cursor-pointer flex-col rounded-lg border border-edge bg-raised p-4 shadow-sm transition-colors duration-150 hover:border-edge-strong hover:bg-sunken"
                >
                  <span className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${t.color as string} 12%, transparent)`,
                        color: t.color as string,
                      }}
                    >
                      <Icon name={t.icon as string} className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink">
                        {t.name as string}
                      </span>
                    </span>
                  </span>
                  {t.description ? (
                    <span className="mt-3 line-clamp-3 text-sm text-ink-secondary">
                      {t.description as string}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* ---------- step 2: the case itself ---------- */

  // Suggest the next number in whatever series this org already uses, without
  // enforcing a format — every agency numbers cases its own way.
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org.orgId);

  const prefix = (org.orgSlug.slice(0, 2) || 'CA').toUpperCase();
  const suggestion = `${prefix}-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;

  const { data: sections } = await supabase
    .from('case_type_sections')
    .select('id, label')
    .eq('case_type_id', chosen.id as string)
    .eq('is_active', true)
    .order('sort_order');

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/cases/new"
        className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Pick a different type
      </Link>

      <header className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${chosen.color as string} 12%, transparent)`,
            color: chosen.color as string,
          }}
        >
          <Icon name={chosen.icon as string} className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-ink">New {chosen.name as string}</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {(sections ?? []).length} section{(sections ?? []).length === 1 ? '' : 's'} to fill in
            once it exists.
          </p>
        </div>
      </header>

      <NewCaseForm
        orgId={org.orgId}
        caseTypeId={chosen.id as string}
        suggestion={suggestion}
      />

      {(sections ?? []).length > 0 ? (
        <div className="rounded-lg border border-edge bg-sunken p-3">
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">
            What this type will ask for
          </p>
          <ol className="flex flex-wrap gap-1.5">
            {(sections ?? []).map((s) => (
              <li
                key={s.id as string}
                className="rounded-full border border-edge bg-raised px-2 py-0.5 text-xs text-ink-secondary"
              >
                {s.label as string}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
