'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Moving a case between pipeline columns.
 *
 * The interesting part is what this does NOT do: it does not check whether the
 * mover is allowed to reach that status. enforce_status_transition() in
 * migration 0004 raises for any status flagged requires_review_role when the
 * caller is below reviewer, and cases_update policy handles the rest. This
 * translates that refusal into something a person can read, and the board puts
 * the card back where it was.
 *
 * The status change is written to activity_logs by the trigger in 0011, with
 * the old and new labels — the client does not report its own moves.
 */

export type MoveResult =
  | { ok: true; statusId: string }
  | { ok: false; error: string };

export async function moveCase(input: {
  caseId: string;
  statusId: string;
}): Promise<MoveResult> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('cases')
    .update({ status_id: input.statusId })
    .eq('id', input.caseId)
    .select('id, status_id');

  if (error) {
    // The trigger raises with errcode 42501 and a message naming the status.
    if (/requires the reviewer role/i.test(error.message)) {
      const status = error.message.split('"')[1];
      return {
        ok: false,
        error: status
          ? `Moving a case to "${status}" needs the reviewer role.`
          : 'That move needs the reviewer role.',
      };
    }
    if (error.code === '42501') {
      return { ok: false, error: 'Read-only access — the case was not moved.' };
    }
    return { ok: false, error: error.message };
  }

  if (!data?.length) {
    return { ok: false, error: 'The case was not moved — you may not have permission.' };
  }

  revalidatePath('/pipeline');
  revalidatePath('/cases');
  revalidatePath(`/cases/${input.caseId}`);

  return { ok: true, statusId: data[0].status_id as string };
}
