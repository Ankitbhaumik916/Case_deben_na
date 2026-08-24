import Link from 'next/link';
import { Plus, ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CaseFilters } from './CaseFilters';
import { CaseTable } from './CaseTable';
import { CaseMap } from './CaseMap';
import { SavedViews, type SavedViewRow } from './SavedViews';
import { resolveColumns } from './columns';
import { CASE_SELECT, type CaseRow } from './types';

export const metadata = { title: 'Cases' };

const VIEWS = [
  ['list', 'List'],
  ['map', 'Map'],
  ['stats', 'Stats'],
] as const;

const FILTER_KEYS = ['q', 'type', 'status', 'county', 'from', 'to'] as const;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
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
  const columns = resolveColumns(searchParams.cols);

  const filters = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, searchParams[k] ?? '']).filter(([, v]) => v),
  ) as Record<string, string>;
  const hasFilters = Object.keys(filters).length > 0;

  const supabase = createSupabaseServerClient();

  const [{ data: types }, { data: statuses }, { data: counties }, { data: savedViews }] =
    await Promise.all([
      supabase
        .from('case_types')
        .select('id, name, slug, color, icon')
        .eq('org_id', org.orgId)
        .order('name'),
      supabase
        .from('case_statuses')
        .select('id, key, label, color, sort_order')
        .eq('org_id', org.orgId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('cases').select('county').eq('org_id', org.orgId).not('county', 'is', null),
      // RLS already limits this to the caller's own views plus shared ones.
      supabase
        .from('saved_views')
        .select('id, name, filters, columns, view_mode, is_shared, is_locked, user_id')
        .eq('org_id', org.orgId)
        .order('name'),
    ]);

  let query = supabase
    .from('case_list_view')
    .select(CASE_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.q) {
    // Matches case number, address, every person on the case and every dynamic
    // field value — cases.search_tsv is kept current by the triggers in 0010.
    query = query.textSearch('search_tsv', filters.q, { type: 'websearch', config: 'english' });
  }
  if (filters.type) query = query.eq('case_type_slug', filters.type);
  if (filters.status) query = query.eq('status_key', filters.status);
  if (filters.county) query = query.eq('county', filters.county);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`);

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

  const views: SavedViewRow[] = (savedViews ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    filters: (v.filters as Record<string, string>) ?? {},
    columns: Array.isArray(v.columns) ? (v.columns as string[]) : [],
    viewMode: (v.view_mode as string) ?? 'list',
    isShared: Boolean(v.is_shared),
    isLocked: Boolean(v.is_locked),
    isMine: v.user_id === user.id,
  }));

  const queryString = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...patch })) {
      if (v) params.set(k, v);
    }
    return params.toString();
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cases</h1>
          <p className="tabular mt-0.5 font-mono text-xs text-ink-muted">
            {cases.length}
            {cases.length === 200 ? '+' : ''} shown{hasFilters ? ' · filtered' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <nav
            aria-label="View mode"
            className="flex rounded border border-edge-strong bg-raised p-0.5"
          >
            {VIEWS.map(([key, label]) => (
              <Link
                key={key}
                href={`/cases?${queryString({ view: key })}`}
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
            ))}
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

      <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
        <SavedViews
          orgId={org.orgId}
          views={views}
          currentFilters={filters}
          currentColumns={columns}
          activeViewId={searchParams.savedView}
          canShare={can.admin(org.rank)}
        />

        <div className="min-w-0 space-y-3">
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

          {view === 'list' ? (
            <CaseTable
              cases={cases}
              columns={columns}
              hasFilters={hasFilters}
              canWrite={can.write(org.rank)}
            />
          ) : null}
          {view === 'stats' ? <StatsView cases={cases} /> : null}
          {view === 'map' ? <CaseMap cases={cases} /> : null}
        </div>
      </div>
    </div>
  );
}

/* ================================================================= stats === */

function StatsView({ cases }: { cases: CaseRow[] }) {
  if (cases.length === 0) {
    return (
      <EmptyState title="Nothing to summarise" description="No cases match the current filters." />
    );
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
        <Breakdown
          title="By status"
          rows={byStatus}
          total={cases.length}
          colorOf={(k) => statusColor.get(k) ?? null}
        />
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
