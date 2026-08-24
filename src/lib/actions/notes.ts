'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Admin notes: the running commentary on a case, threaded and attributed.
 *
 * Distinct from the audit trail on purpose. activity_logs records what the
 * system observed and cannot be edited by anyone; these are what people chose
 * to say, and their author can correct or withdraw them. Conflating the two
 * would let someone quietly rewrite the record of what happened.
 */

export type NoteResult = { ok: true } | { ok: false; error: string };

const Body = z
  .string()
  .trim()
  .min(1, 'Write something first.')
  .max(4000, 'That note is too long.');

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export async function createNote(input: {
  caseId: string;
  body: string;
  parentId?: string | null;
}): Promise<NoteResult> {
  const parsed = Body.safeParse(input.body);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('Your session has expired. Sign in again.');

  const { data: parent } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!parent) return fail('That case no longer exists.');

  const { error } = await supabase.from('admin_notes').insert({
    org_id: parent.org_id as string,
    case_id: input.caseId,
    parent_id: input.parentId ?? null,
    // The insert policy requires author_id = auth.uid(), so a note cannot be
    // posted under someone else's name even by a direct API call.
    author_id: user.id,
    body: parsed.data,
  });

  if (error) {
    if (error.code === '42501') {
      return fail('Read-only accounts cannot add notes.');
    }
    return fail(error.message);
  }

  revalidatePath('/pipeline');
  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true };
}

export async function updateNote(input: {
  noteId: string;
  caseId: string;
  body: string;
}): Promise<NoteResult> {
  const parsed = Body.safeParse(input.body);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('admin_notes')
    .update({ body: parsed.data })
    .eq('id', input.noteId)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not saved — you can only edit your own notes.');

  revalidatePath('/pipeline');
  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true };
}

export async function deleteNote(input: {
  noteId: string;
  caseId: string;
}): Promise<NoteResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('admin_notes')
    .delete()
    .eq('id', input.noteId)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not removed — you can only delete your own notes.');

  revalidatePath('/pipeline');
  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true };
}
