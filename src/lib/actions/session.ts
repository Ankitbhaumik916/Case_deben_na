'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE, getCurrentUser } from '@/lib/auth';

/**
 * Switch the active organisation.
 *
 * The cookie is a UI preference, not a permission: getCurrentUser() only
 * honours it if the user actually holds a role in that org, and RLS would
 * refuse the data regardless. Setting it to someone else's org id achieves
 * nothing.
 */
export async function setActiveOrg(orgId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.memberships.some((m) => m.orgId === orgId)) {
    return;
  }

  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  cookies().delete(ACTIVE_ORG_COOKIE);
  redirect('/login');
}
