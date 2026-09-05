'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Interviews and statements on a case.
 *
 * A case has as many as it has — a witness, a neighbour, the crew that arrived
 * first, the owner, the owner again a week later. The interviews table was
 * built for that from the start; what did not exist was a way to reach it, so
 * a case type's "Witness Accounts" section was the only place to put any of it
 * and could hold exactly one set of answers.
 *
 * Recordings go to the private case-audio bucket under the same
 * {org_id}/{case_id}/{file} path the library uses, so the same storage policy
 * decides who may write there. Transcription itself is not wired to a provider
 * yet; transcript_status stays where the schema starts it, and the interface
 * says so rather than showing a button that does nothing.
 */

export type InterviewResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done: InterviewResult = { ok: true, data: null };

const AUDIO_BUCKET = 'case-audio';

/** 500MB matches the bucket limit; an hour of speech is a small fraction of it. */
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

function safeName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
  return cleaned || 'recording';
}

const Details = z.object({
  subjectName: z
    .string()
    .trim()
    .min(2, 'Give the interview a subject.')
    .max(120, 'That name is too long.'),
  subjectPersonId: z.string().uuid().nullable().optional(),
  conductedBy: z.string().trim().max(120).optional().or(z.literal('')),
  conductedById: z.string().uuid().nullable().optional(),
  interviewDate: z.string().trim().optional().or(z.literal('')),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  narrative: z.string().max(20000).optional().or(z.literal('')),
});

type DetailsInput = z.infer<typeof Details>;

function toRow(d: DetailsInput) {
  return {
    subject_name: d.subjectName,
    subject_person_id: d.subjectPersonId || null,
    conducted_by: d.conductedBy || null,
    conducted_by_id: d.conductedById || null,
    // A timestamptz column will not take an empty string, and a date-only input
    // gives one the moment somebody clears it.
    interview_date: d.interviewDate ? new Date(d.interviewDate).toISOString() : null,
    location: d.location || null,
    narrative: d.narrative || null,
  };
}

export async function createInterview(
  input: DetailsInput & { caseId: string },
): Promise<InterviewResult<{ id: string }>> {
  const parsed = Details.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reading the case through RLS is the permission check: no case, no interview.
  const { data: kase } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!kase) return fail('That case does not exist, or you cannot see it.');

  const { data, error } = await supabase
    .from('interviews')
    .insert({
      org_id: kase.org_id as string,
      case_id: input.caseId,
      ...toRow(parsed.data),
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') return fail('Your role does not allow adding interviews.');
    return fail(error.message);
  }

  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateInterview(
  input: DetailsInput & { id: string; caseId: string },
): Promise<InterviewResult> {
  const parsed = Details.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('interviews')
    .update(toRow(parsed.data))
    .eq('id', input.id)
    .select('id');

  if (error) {
    if (error.code === '42501') return fail('Your role does not allow editing interviews.');
    return fail(error.message);
  }
  // An update refused by a USING clause matches nothing and raises no error, so
  // an empty result is the refusal.
  if (!data?.length) return fail('Not saved — you do not have write access to this case.');

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}

export async function deleteInterview(input: {
  id: string;
  caseId: string;
}): Promise<InterviewResult> {
  const supabase = createSupabaseServerClient();

  // The recording is not deleted with the row on purpose. Storage has no
  // transaction with the database, so removing the object first and then
  // failing the delete would leave a row pointing at nothing; this way the
  // worst case is an orphaned file, which is recoverable.
  const { data, error } = await supabase
    .from('interviews')
    .delete()
    .eq('id', input.id)
    .select('id, audio_path');

  if (error) {
    if (error.code === '42501') return fail('Your role does not allow removing interviews.');
    return fail(error.message);
  }
  if (!data?.length) return fail('Not removed — you do not have write access to this case.');

  const path = data[0].audio_path as string | null;
  if (path) await supabase.storage.from(AUDIO_BUCKET).remove([path]);

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}

/** Where a recording for this case belongs. The browser does the upload. */
export async function prepareAudioUpload(input: {
  caseId: string;
  fileName: string;
  size: number;
}): Promise<InterviewResult<{ path: string; bucket: string }>> {
  if (!input.fileName?.trim()) return fail('That file has no name.');
  if (input.size === 0) return fail('That file is empty.');
  if (input.size > MAX_AUDIO_BYTES) {
    return fail(`That recording is ${Math.round(input.size / 1024 / 1024)}MB. The limit is 500MB.`);
  }

  const supabase = createSupabaseServerClient();
  const { data: kase } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!kase) return fail('That case does not exist, or you cannot see it.');

  const unique = crypto.randomUUID().slice(0, 8);
  const path = `${kase.org_id}/${input.caseId}/${unique}-${safeName(input.fileName)}`;

  return { ok: true, data: { path, bucket: AUDIO_BUCKET } };
}

const Audio = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  storagePath: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().max(120).optional().or(z.literal('')),
  durationSeconds: z.number().nonnegative().max(24 * 60 * 60).optional(),
});

export async function attachAudio(input: z.infer<typeof Audio>): Promise<InterviewResult> {
  const parsed = Audio.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();

  // Replacing a recording leaves the old object behind unless we say otherwise.
  const { data: existing } = await supabase
    .from('interviews')
    .select('audio_path')
    .eq('id', parsed.data.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('interviews')
    .update({
      bucket: AUDIO_BUCKET,
      audio_path: parsed.data.storagePath,
      audio_mime: parsed.data.mimeType || null,
      duration_seconds: parsed.data.durationSeconds ?? null,
    })
    .eq('id', parsed.data.id)
    .select('id');

  if (error) {
    if (error.code === '42501') return fail('Your role does not allow attaching a recording.');
    return fail(error.message);
  }
  if (!data?.length) return fail('Not attached — you do not have write access to this case.');

  const previous = existing?.audio_path as string | null;
  if (previous && previous !== parsed.data.storagePath) {
    await supabase.storage.from(AUDIO_BUCKET).remove([previous]);
  }

  revalidatePath(`/cases/${parsed.data.caseId}`);
  return done;
}

export async function removeAudio(input: {
  id: string;
  caseId: string;
}): Promise<InterviewResult> {
  const supabase = createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('interviews')
    .select('audio_path')
    .eq('id', input.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('interviews')
    .update({ audio_path: null, audio_mime: null, duration_seconds: null })
    .eq('id', input.id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not removed — you do not have write access to this case.');

  const path = existing?.audio_path as string | null;
  if (path) await supabase.storage.from(AUDIO_BUCKET).remove([path]);

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}
