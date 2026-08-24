'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Autosave for the dynamic fields on a case.
 *
 * Runs as the signed-in user, so a read_only account is refused by RLS rather
 * than by a check here. Every write also lands in activity_logs via the trigger
 * in migration 0011 — the audit trail is the database's job, not the client's,
 * which is why an edit made through the REST API is recorded exactly the same.
 */

export type SaveResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

export async function saveFieldValue(input: {
  caseId: string;
  fieldId: string;
  value: unknown;
}): Promise<SaveResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' };

  const { data: parent } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!parent) return { ok: false, error: 'That case no longer exists.' };

  // Empty means "not recorded". Storing "" would make the completion dots lie.
  const normalised =
    input.value === '' ||
    input.value === undefined ||
    (Array.isArray(input.value) && input.value.length === 0)
      ? null
      : input.value;

  const { error } = await supabase.from('case_field_values').upsert(
    {
      org_id: parent.org_id as string,
      case_id: input.caseId,
      field_id: input.fieldId,
      value: normalised as never,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'case_id,field_id' },
  );

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'Read-only access — this change was not saved.' };
    }
    return { ok: false, error: error.message };
  }

  // The list shows a search built from these values, so it has to be refreshed.
  revalidatePath(`/cases/${input.caseId}`);
  revalidatePath('/cases');

  return { ok: true, savedAt: new Date().toISOString() };
}

/** Marks a section done for case types whose completion_rule is 'manual'. */
export async function setSectionComplete(input: {
  caseId: string;
  sectionId: string;
  complete: boolean;
}): Promise<SaveResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' };

  const { data: parent } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!parent) return { ok: false, error: 'That case no longer exists.' };

  const { error } = await supabase.from('case_section_status').upsert(
    {
      org_id: parent.org_id as string,
      case_id: input.caseId,
      section_id: input.sectionId,
      is_complete: input.complete,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'case_id,section_id' },
  );

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'Read-only access — this change was not saved.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true, savedAt: new Date().toISOString() };
}
