import { ShieldAlert } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser, can } from '@/lib/auth';
import { EmptyState } from '@/components/ui';
import { CaseTypeList, type CaseTypeRow } from './CaseTypeList';

export const metadata = { title: 'Case types' };

async function loadCaseTypes(orgId: string): Promise<CaseTypeRow[]> {
  const supabase = createSupabaseServerClient();

  const [{ data: types }, { data: sections }, { data: cases }] = await Promise.all([
    supabase
      .from('case_types')
      .select('id, name, slug, description, icon, color, is_active, created_at')
      .eq('org_id', orgId)
      .order('name'),
    supabase.from('case_type_sections').select('id, case_type_id'),
    supabase.from('cases').select('id, case_type_id'),
  ]);

  const sectionCount = new Map<string, number>();
  for (const s of sections ?? []) {
    const key = s.case_type_id as string;
    sectionCount.set(key, (sectionCount.get(key) ?? 0) + 1);
  }

  const caseCount = new Map<string, number>();
  for (const c of cases ?? []) {
    const key = c.case_type_id as string;
    caseCount.set(key, (caseCount.get(key) ?? 0) + 1);
  }

  return (types ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    slug: t.slug as string,
    description: (t.description as string | null) ?? null,
    icon: (t.icon as string | null) ?? 'folder',
    color: (t.color as string | null) ?? '#2563eb',
    isActive: t.is_active as boolean,
    sectionCount: sectionCount.get(t.id as string) ?? 0,
    caseCount: caseCount.get(t.id as string) ?? 0,
  }));
}

export default async function CaseTypesPage() {
  const user = await requireUser();
  const org = user.activeOrg;

  if (!org) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You are not a member of any organisation"
        description="Case types are configured per organisation."
      />
    );
  }

  // The RLS policies would refuse the writes anyway; this just avoids showing
  // an editor whose every button fails.
  if (!can.admin(org.rank)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrator access required"
        description="Case types define the sections, fields, statuses and report structure every case of that discipline uses. Only administrators can change them."
      />
    );
  }

  const caseTypes = await loadCaseTypes(org.orgId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Case types</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-secondary">
          A case type is a whole discipline expressed as data — its sidebar sections, its
          fields, its status pipeline, its compliance checklist and its report structure.
          Adding one here makes it available immediately; nothing needs to be deployed.
        </p>
      </header>

      <CaseTypeList orgId={org.orgId} caseTypes={caseTypes} />
    </div>
  );
}
