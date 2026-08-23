import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ROLE_RANK, type RoleName } from '@/lib/roles';

// Re-exported so server code has one import for auth concerns.
export { ROLE_RANK, ROLE_LABEL, can } from '@/lib/roles';
export type { RoleName } from '@/lib/roles';

export const ACTIVE_ORG_COOKIE = 'fb_active_org';

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  logoUrl: string | null;
  roles: RoleName[];
  /** Highest role held in this org. */
  rank: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  memberships: Membership[];
  activeOrg: Membership | null;
}

/**
 * The signed-in user with their org memberships and effective role in each.
 * Wrapped in cache() so a layout and the page it renders share one round trip.
 */
/**
 * PostgREST embeds resolve to `never` under the generated types, so the joined
 * row shape is declared explicitly and handed to .returns<>().
 */
interface UserRoleRow {
  org_id: string;
  roles: { name: string } | null;
  organizations: { id: string; name: string; slug: string; logo_url: string | null } | null;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from('users').select('id, email, full_name, avatar_url, job_title').eq('id', user.id).maybeSingle(),
    supabase
      .from('user_roles')
      .select('org_id, roles ( name ), organizations ( id, name, slug, logo_url )')
      .eq('user_id', user.id)
      .returns<UserRoleRow[]>(),
  ]);

  const byOrg = new Map<string, Membership>();

  for (const row of roleRows ?? []) {
    const org = row.organizations;
    const role = row.roles?.name as RoleName | undefined;
    if (!org || !role || !(role in ROLE_RANK)) continue;

    const existing = byOrg.get(org.id);
    if (existing) {
      existing.roles.push(role);
      existing.rank = Math.max(existing.rank, ROLE_RANK[role]);
    } else {
      byOrg.set(org.id, {
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        logoUrl: org.logo_url,
        roles: [role],
        rank: ROLE_RANK[role],
      });
    }
  }

  const memberships = [...byOrg.values()].sort((a, b) => a.orgName.localeCompare(b.orgName));

  const preferred = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg =
    memberships.find((m) => m.orgId === preferred) ?? memberships[0] ?? null;

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    fullName: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    jobTitle: profile?.job_title ?? null,
    memberships,
    activeOrg,
  };
});

/** For pages that must have a session. The middleware normally gets there first. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
