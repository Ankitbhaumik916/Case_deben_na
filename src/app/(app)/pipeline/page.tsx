import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CASE_SELECT, type CaseRow } from '../cases/types';
import { Board, type Column } from './Board';

export const metadata = { title: 'Pipeline' };

export default async function PipelinePage({
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
        description="The pipeline is scoped to an organisation."
      />
    );
  }

  const supabase = createSupabaseServerClient();

  const [{ data: types }, { data: allStatuses }] = await Promise.all([
    supabase
      .from('case_types')
      .select('id, name, slug')
      .eq('org_id', org.orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('case_statuses')
      .select('id, key, label, color, sort_order, case_type_id, requires_review_role')
      .eq('org_id', org.orgId)
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  const selectedType = (types ?? []).find((t) => t.slug === searchParams.type);

  /*
   * Which pipeline to draw.
   *
   * Case types may define their own statuses, so there is no single board that
   * is correct for all of them. Without a type filter the org-wide set is
   * shown; picking a type switches to that type's own pipeline if it has one.
   * Cases whose status falls outside whichever set is drawn are counted and
   * named on the board rather than silently disappearing.
   */
  const typeSpecific = selectedType
    ? (allStatuses ?? []).filter((s) => s.case_type_id === selectedType.id)
    : [];
  const orgWide = (allStatuses ?? []).filter((s) => s.case_type_id === null);
  const pipeline = typeSpecific.length > 0 ? typeSpecific : orgWide;

  const columns: Column[] = pipeline.map((s) => ({
    id: s.id as string,
    key: s.key as string,
    label: s.label as string,
    color: (s.color as string) ?? '#64748b',
    requiresReview: Boolean(s.requires_review_role),
  }));

  let query = supabase
    .from('case_list_view')
    .select(CASE_SELECT)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(300);

  if (searchParams.type) query = query.eq('case_type_slug', searchParams.type);
  if (searchParams.county) query = query.eq('county', searchParams.county);
  if (searchParams.from) query = query.gte('created_at', searchParams.from);
  if (searchParams.to) query = query.lte('created_at', `${searchParams.to}T23:59:59`);
  if (searchParams.q) {
    query = query.textSearch('search_tsv', searchParams.q, {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data: rows, error } = await query.returns<CaseRow[]>();
  const cases = rows ?? [];

  const linkFor = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...patch })) {
      if (v) params.set(k, v);
    }
    const q = params.toString();
    return q ? `/pipeline?${q}` : '/pipeline';
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pipeline</h1>
          <p className="tabular mt-0.5 font-mono text-xs text-ink-muted">
            {cases.length} case{cases.length === 1 ? '' : 's'} ·{' '}
            {typeSpecific.length > 0
              ? `${selectedType?.name} pipeline`
              : 'organisation-wide pipeline'}
          </p>
        </div>

        <nav aria-label="Case type" className="flex flex-wrap gap-1">
          <Link
            href={linkFor({ type: undefined })}
            aria-current={!searchParams.type ? 'page' : undefined}
            className={cn(
              'rounded border px-2.5 py-1 text-xs transition-colors duration-150',
              !searchParams.type
                ? 'border-transparent bg-chrome font-medium text-ink-inverse'
                : 'border-edge-strong bg-raised text-ink-secondary hover:bg-sunken hover:text-ink',
            )}
          >
            All types
          </Link>
          {(types ?? []).map((t) => (
            <Link
              key={t.id as string}
              href={linkFor({ type: t.slug as string })}
              aria-current={searchParams.type === t.slug ? 'page' : undefined}
              className={cn(
                'rounded border px-2.5 py-1 text-xs transition-colors duration-150',
                searchParams.type === t.slug
                  ? 'border-transparent bg-chrome font-medium text-ink-inverse'
                  : 'border-edge-strong bg-raised text-ink-secondary hover:bg-sunken hover:text-ink',
              )}
            >
              {t.name as string}
            </Link>
          ))}
        </nav>
      </header>

      {error ? (
        <p className="rounded border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}

      {columns.length === 0 ? (
        <EmptyState
          title="No statuses configured"
          description={
            can.admin(org.rank)
              ? 'A pipeline needs statuses. Add them on the case type in Admin → Case Types, or define an organisation-wide set.'
              : 'An administrator needs to configure the status pipeline before this board can be used.'
          }
        />
      ) : (
        <Board
          columns={columns}
          cases={cases}
          canWrite={can.write(org.rank)}
          currentUserId={user.id}
          isAdmin={can.admin(org.rank)}
        />
      )}

      <p className="text-xs text-ink-muted">
        Drag a card between columns, or use its “Move to” list — both do the same thing, and the
        second one works with a keyboard. Every move is recorded in the activity log.
      </p>
    </div>
  );
}
