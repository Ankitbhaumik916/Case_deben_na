import Link from 'next/link';
import { FolderOpen, Layers, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can, ROLE_LABEL } from '@/lib/auth';
import { EmptyState, RoleBadge } from '@/components/ui';
import { Icon } from '@/components/ui/icon';

export const metadata = { title: 'Portal' };

interface CaseTypeTile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  caseCount: number;
}

/**
 * PostgREST returns an aggregate embed as `cases: [{ count }]`, a shape the
 * generated types cannot infer, so the row shape is declared explicitly.
 */
interface CaseTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  cases: { count: number }[] | null;
}

async function loadCaseTypes(orgId: string): Promise<CaseTypeTile[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('case_types')
    .select('id, name, slug, description, icon, color, cases(count)')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name')
    .returns<CaseTypeRow[]>();

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    color: row.color,
    caseCount: row.cases?.[0]?.count ?? 0,
  }));
}

export default async function PortalPage() {
  const user = await requireUser();
  const firstName = user.fullName?.split(/\s+/)[0] ?? null;

  if (!user.activeOrg) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You are not a member of any organisation"
        description="Your account exists but has no role assigned yet. An administrator needs to invite you to an organisation before you can see any cases."
      />
    );
  }

  const org = user.activeOrg;
  const caseTypes = await loadCaseTypes(org.orgId);
  const totalCases = caseTypes.reduce((sum, t) => sum + t.caseCount, 0);

  return (
    <div className="space-y-8">
      {/* ---------- greeting ---------- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">
            <span>{org.orgName}</span>
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>
            <span className="flex flex-wrap gap-1">
              {org.roles
                .slice()
                .sort((a, b) => ROLE_LABEL[a].localeCompare(ROLE_LABEL[b]))
                .map((role) => (
                  <RoleBadge key={role} role={role} />
                ))}
            </span>
          </p>
        </div>

        <dl className="flex items-center gap-6">
          <div>
            <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
              Case types
            </dt>
            <dd className="tabular mt-0.5 font-mono text-2xl font-semibold text-ink">
              {caseTypes.length}
            </dd>
          </div>
          <div>
            <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
              Total cases
            </dt>
            <dd className="tabular mt-0.5 font-mono text-2xl font-semibold text-ink">
              {totalCases}
            </dd>
          </div>
        </dl>
      </header>

      {/* ---------- case type tiles ---------- */}
      <section aria-labelledby="apps-heading">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="apps-heading" className="text-lg font-semibold text-ink">
            Your case types
          </h2>
          {can.admin(org.rank) ? (
            <span className="text-xs text-ink-muted">
              Configured in Admin → Case Types
            </span>
          ) : null}
        </div>

        {caseTypes.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No case types configured yet"
            description={
              can.admin(org.rank)
                ? 'Case types define the sections, fields, statuses and report template for a discipline. Create one in the Case Type Builder and it becomes available here immediately — no deploy required.'
                : 'An administrator needs to configure at least one case type before cases can be created.'
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {caseTypes.map((type) => (
              <li key={type.id}>
                <CaseTypeCard type={type} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CaseTypeCard({ type }: { type: CaseTypeTile }) {
  return (
    <Link
      href={`/cases?type=${type.slug}`}
      className="group relative flex h-full cursor-pointer flex-col rounded-lg border border-edge bg-raised p-4 shadow-sm transition-colors duration-150 hover:border-edge-strong hover:bg-sunken"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded"
          style={{
            backgroundColor: `color-mix(in srgb, ${type.color ?? '#8a6a2f'} 12%, transparent)`,
            color: type.color ?? 'var(--accent)',
          }}
        >
          <Icon name={type.icon} className="h-4.5 w-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-ink">{type.name}</h3>
          <p className="tabular mt-0.5 font-mono text-xs text-ink-muted">
            {type.caseCount} {type.caseCount === 1 ? 'case' : 'cases'}
          </p>
        </div>
      </div>

      {type.description ? (
        <p className="mt-3 line-clamp-3 text-sm text-ink-secondary">{type.description}</p>
      ) : null}

      <div className="mt-4 flex items-center gap-1.5 pt-1 text-xs text-ink-muted group-hover:text-ink-secondary">
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Open the case list</span>
      </div>
    </Link>
  );
}
