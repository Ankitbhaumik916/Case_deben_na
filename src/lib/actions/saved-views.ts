'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Saved views: a named filter set pinned beside the case list.
 *
 * Two kinds. A personal view belongs to whoever made it and nobody else can see
 * it. A shared view is org furniture — everyone sees it, and it is marked
 * locked so only an admin can change or remove it. That distinction is enforced
 * by the policies in migration 0012, not here: the insert simply fails for an
 * investigator who tries to create a shared one.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done: ActionResult = { ok: true, data: null };

const ViewInput = z.object({
  name: z.string().trim().min(2, 'Give the view a name.').max(60),
  viewMode: z.enum(['list', 'map', 'stats']).optional(),
});

export async function createSavedView(input: {
  orgId: string;
  name: string;
  filters: Record<string, string>;
  columns?: string[];
  viewMode?: 'list' | 'map' | 'stats';
  shared?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = ViewInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Not signed in.');

  const { data, error } = await supabase
    .from('saved_views')
    .insert({
      org_id: input.orgId,
      // A shared view has no owner; a personal one is owned by its maker, which
      // is exactly what the select policy keys off.
      user_id: input.shared ? null : user.id,
      name: parsed.data.name,
      view_mode: input.viewMode ?? 'list',
      filters: input.filters,
      columns: input.columns ?? [],
      is_shared: Boolean(input.shared),
      is_locked: Boolean(input.shared),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') {
      return fail(
        input.shared
          ? 'Only an administrator can create a shared view. Save it as a personal one instead.'
          : 'Could not save that view.',
      );
    }
    return fail(error.message);
  }

  revalidatePath('/cases');
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteSavedView(id: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('saved_views').delete().eq('id', id).select('id');

  if (error) return fail(error.message);
  if (!data?.length) {
    return fail('Not removed — a locked view can only be changed by an administrator.');
  }

  revalidatePath('/cases');
  return done;
}
