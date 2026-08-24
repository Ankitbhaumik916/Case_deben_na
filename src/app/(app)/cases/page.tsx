import Link from 'next/link';
import { FolderOpen, Map as MapIcon, Plus, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { Badge, Button, EmptyState } from '@/components/ui';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { CaseFilters } from './CaseFilters';

export const metadata = { title: 'Cases' };

const VIEWS = [
  ['list', 'List'],
  ['map', 'Map'],
  ['stats', 'Stats'],
] as const;

export interface CaseRow {
  id: string;
  case_number: string;
  title: string | null;
  address: string | null;
  county: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  days_open: number;
  case_type_id: string;
  case_type_name: string;
  case_type_slug: string;
  case_type_color: string;
  case_type_icon: string;
  status_key: string | null;
  status_label: string | null;
  status_color: string | null;
  lead_investigator_name: string | null;
  created_by_name: string | null;
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: {
    view?: string;
    q?: string;
    type?: string;
    status?: string;
    county?: string;
    from?: string;
    to?: string;
  };
}) {
  const user = await requireUser();
  const org = user.activeOrg;

  if (!org) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You are not a member of any organisation"
        description="Cases are scoped to an organisation."
      />
    );
  }

  const view = (VIEWS.find(([v]) => v === searchParams.view)?.[0] ?? 'list') as
    | 'list'
    | 'map'
    | 'stats';

  const supabase = createSupabaseServerClient();

  // Filter options come from the org's own configuration, never a hardcoded list.
  const [{ data: types }, { data: statuses }, { data: counties }] = await Promise.all([
    supabase
      .from('case_types')
      .select('id, name, slug, color, icon')
      .eq('org_id', org.orgId)
      .order('name'),
    supabase
      .from('case_statuses')
      .select('id, key, label, color, case_type_id, sort_order')
      .eq('org_id', org.orgId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('cases').select('county').eq('org_id', org.orgId).not('county', 'is', null),
  ]);

  let query = supabase
    .from('case_list_view')
    .select(
      'id, case_number, title, address, county, state, lat, lng, created_at, days_open, case_type_id, case_type_name, case_type_slug, case_type_color, case_type_icon, status_key, status_label, status_color, lead_investigator_name, created_by_name',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (searchParams.q?.trim()) {
    // Matches case number, address, every person on the case and every dynamic
    // field value — cases.search_tsv is kept current by triggers in 0010.
    query = query.textSearch('search_tsv', searchParams.q.trim(), {
      type: 'websearch',
      config: 'english',
    });
  }
  if (searchParams.type) query = query.eq('case_type_slug', searchParams.type);
  if (searchParams.status) query = query.eq('status_key', searchParams.status);
  if (searchParams.county) query = query.eq('county', searchParams.county);
  if (searchParams.from) query = query.gte('created_at', searchParams.from);
  if (searchParams.to) query = query.lte('created_at', `${searchParams.to}T23:59:59`);

  const { data: rows, error } = await query.returns<CaseRow[]>();
  const cases = rows ?? [];

  const countyOptions = [
    ...new Set((counties ?? []).map((c) => c.county as string).filter(Boolean)),
  ].sort();

  const statusOptions = [
    ...new Map(
      (statuses ?? []).map((s) => [
        s.key as string,
        { key: s.key as string, label: s.label as string, color: s.color as string },
      ]),
    ).values(),
  ];

  const hasFilters = Boolean(
    searchParams.q ||
      searchParams.type ||
      searchParams.status ||
      searchParams.county ||
      searchParams.from ||
      searchParams.to,
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cases</h1>
          <p className="tabular mt-0.5 font-mono text-xs text-ink-muted">
            {cases.length}
            {cases.length === 200 ? '+' : ''} shown
            {hasFilters ? ' · filtered' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <nav aria-label="View mode" className="flex rounded border border-edge-strong bg-raised p-0.5">
            {VIEWS.map(([key, label]) => {
              const params = new URLSearchParams(
                Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
              );
              params.set('view', key);
              return (
                <Link
                  key={key}
                  href={`/cases?${params.toString()}`}
                  aria-current={view === key ? 'page' : undefined}
                  className={cn(
                    'rounded-sm px-2.5 py-1 text-xs transition-colors duration-150',
                    view === key
                      ? 'bg-chrome font-medium text-ink-inverse'
                      : 'text-ink-secondary hover:bg-sunken hover:text-ink',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {can.write(org.rank) ? (
            <Link
              href="/cases/new"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded bg-chrome px-3.5 text-sm font-medium text-ink-inverse transition-colors duration-150 hover:bg-chrome-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New case
            </Link>
          ) : null}
        </div>
      </header>

      <CaseFilters
        types={(types ?? []).map((t) => ({ slug: t.slug as string, name: t.name as string }))}
        statuses={statusOptions}
        counties={countyOptions}
        current={searchParams}
      />

      {error ? (
        <p className="rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}

      {view === 'list' ? <ListView cases={cases} hasFilters={hasFilters} canWrite={can.write(org.rank)} /> : null}
      {view === 'stats' ? <StatsView cases={cases} /> : null}
      {view === 'map' ? <MapView cases={cases} /> : null}
    </div>
  );
}

/* ================================================================== list === */

function ListView({
  cases,
  hasFilters,
  canWrite,
}: {
  cases: CaseRow[];
  hasFilters: boolean;
  canWrite: boolean;
}) {
  if (cases.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={hasFilters ? 'No cases match those filters' : 'No cases yet'}
        description={
          hasFilters
            ? 'Clear a filter above, or widen the date range.'
            : canWrite
              ? 'Create one to get started. Its sections and fields come from the case type you pick.'
              : 'Nothing has been filed in this organisation yet.'
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-edge bg-raised">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge bg-sunken text-left">
            <Th>Case</Th>
            <Th>Address</Th>
            <Th>County</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th align="right">Days open</Th>
            <Th>Created</Th>
            <Th>Lead</Th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="border-b border-edge last:border-0 hover:bg-sunken">
              <td className="px-3 py-2">
                <Link
                  href={`/cases/${c.id}`}
                  className="tabular font-mono text-xs font-medium text-ink hover:text-accent"
                >
                  {c.case_number}
                </Link>
                {c.title ? (
                  <span className="block max-w-56 truncate text-xs text-ink-muted">{c.title}</span>
                ) : null}
              </td>
              <td className="max-w-56 truncate px-3 py-2 text-ink-secondary">{c.address ?? '—'}</td>
              <td className="px-3 py-2 text-ink-secondary">{c.county ?? '—'}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span style={{ color: c.case_type_color }}>
                    <Icon name={c.case_type_icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-ink-secondary">{c.case_type_name}</span>
                </span>
              </td>
              <td className="px-3 py-2">
                <StatusPill label={c.status_label} color={c.status_color} size="sm" />
              </td>
              <td className="tabular px-3 py-2 text-right font-mono text-xs text-ink-secondary">
                {c.days_open}
              </td>
              <td className="tabular px-3 py-2 font-mono text-xs text-ink-muted">
                {c.created_at.slice(0, 10)}
              </td>
              <td className="max-w-40 truncate px-3 py-2 text-ink-secondary">
                {c.lead_investigator_name ?? c.created_by_name ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-2xs font-medium uppercase tracking-wide text-ink-muted',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

/* ================================================================= stats === */

function StatsView({ cases }: { cases: CaseRow[] }) {
  if (cases.length === 0) {
    return <EmptyState title="Nothing to summarise" description="No cases match the current filters." />;
  }

  const tally = (pick: (c: CaseRow) => string | null) => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const key = pick(c) ?? '—';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };

  const byStatus = tally((c) => c.status_label);
  const byType = tally((c) => c.case_type_name);
  const byCounty = tally((c) => c.county);
  const avgDaysOpen = Math.round(cases.reduce((n, c) => n + c.days_open, 0) / cases.length);
  const oldest = cases.reduce((a, b) => (a.days_open > b.days_open ? a : b));

  const statusColor = new Map(cases.map((c) => [c.status_label ?? '—', c.status_color]));

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cases" value={String(cases.length)} />
        <Stat label="Avg days open" value={String(avgDaysOpen)} />
        <Stat label="Longest open" value={`${oldest.days_open}d`} hint={oldest.case_number} />
        <Stat label="Counties" value={String(byCounty.length)} />
      </dl>

      <div className="grid gap-3 md:grid-cols-3">
        <Breakdown title="By status" rows={byStatus} total={cases.length} colorOf={(k) => statusColor.get(k) ?? null} />
        <Breakdown title="By case type" rows={byType} total={cases.length} />
        <Breakdown title="By county" rows={byCounty} total={cases.length} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-raised p-3">
      <dt className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="tabular mt-0.5 font-mono text-2xl font-semibold text-ink">{value}</dd>
      {hint ? <p className="tabular font-mono text-2xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
  colorOf,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  colorOf?: (key: string) => string | null;
}) {
  return (
    <section className="rounded-lg border border-edge bg-raised p-3">
      <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-ink-muted">{title}</h2>
      <ul className="space-y-1.5">
        {rows.map(([key, count]) => (
          <li key={key}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink-secondary">{key}</span>
              <span className="tabular shrink-0 font-mono text-ink">{count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (count / total) * 100)}%`,
                  backgroundColor: colorOf?.(key) ?? 'var(--accent)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* =================================================================== map === */

function MapView({ cases }: { cases: CaseRow[] }) {
  const located = cases.filter((c) => c.lat !== null && c.lng !== null);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-edge-strong bg-sunken px-6 py-10 text-center">
        <MapIcon className="mx-auto mb-3 h-6 w-6 text-ink-muted" aria-hidden="true" />
        <p className="text-base font-medium text-ink">Map view needs a tile provider</p>
        <p className="mx-auto mt-1 max-w-prose text-sm text-ink-secondary">
          The coordinates are already here — {located.length} of {cases.length} case
          {cases.length === 1 ? '' : 's'} carry a position. Rendering them needs a map library and
          an access token (<code className="font-mono text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code>),
          so the clustered map is held until that is in place rather than shipped broken.
        </p>
      </div>

      {located.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-edge bg-raised">
          <p className="border-b border-edge bg-sunken px-3 py-2 text-2xs font-medium uppercase tracking-wide text-ink-muted">
            Located cases
          </p>
          <ul className="divide-y divide-edge">
            {located.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <Link
                  href={`/cases/${c.id}`}
                  className="tabular font-mono text-xs font-medium text-ink hover:text-accent"
                >
                  {c.case_number}
                </Link>
                <span className="flex-1 truncate text-ink-secondary">{c.address ?? '—'}</span>
                <StatusPill label={c.status_label} color={c.status_color} size="sm" />
                <span className="tabular font-mono text-2xs text-ink-muted">
                  {c.lat!.toFixed(4)}, {c.lng!.toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Badge>No case in this result set has coordinates</Badge>
      )}
    </div>
  );
}
