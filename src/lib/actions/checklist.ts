'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Ticking compliance checks on a case.
 *
 * Only the responses are written here. The checks themselves — which standard,
 * which items, in what order — belong to the case type and are edited in the
 * builder by an administrator. An investigator answers the checklist; they do
 * not get to change the questions. That split is already the database's:
 * case_checklist_responses sits in the investigator-writable tier while
 * checklist_items is admin-only, so this file adds no rule of its own.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const Response = z.object({
  caseId: z.string().uuid(),
  itemId: z.string().uuid(),
  checked: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export async function setChecklistResponse(input: {
  caseId: string;
  itemId: string;
  checked: boolean;
  note?: string;
}): Promise<ActionResult> {
  const parsed = Response.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: kase } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', parsed.data.caseId)
    .maybeSingle();

  if (!kase) return fail('That case is not available to you.');

  // Who ticked it and when is the point of the record, so it is stamped on the
  // way in and cleared again when someone un-ticks — never left behind saying a
  // check was completed by a person who has since withdrawn it.
  const { error } = await supabase.from('case_checklist_responses').upsert(
    {
      org_id: kase.org_id as string,
      case_id: parsed.data.caseId,
      item_id: parsed.data.itemId,
      is_checked: parsed.data.checked,
      note: parsed.data.note || null,
      completed_by: parsed.data.checked ? (user?.id ?? null) : null,
      completed_at: parsed.data.checked ? new Date().toISOString() : null,
    },
    { onConflict: 'case_id,item_id' },
  );

  if (error) {
    if (error.code === '42501') {
      return fail('Your role does not allow completing checks on this case.');
    }
    return fail(error.message);
  }

  revalidatePath(`/cases/${parsed.data.caseId}`);
  return { ok: true };
}
