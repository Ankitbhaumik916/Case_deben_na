'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The case library.
 *
 * Files live in the private `case-media` bucket under {org_id}/{case_id}/{file}.
 * That path shape is not cosmetic: the storage policies in migration 0013 read
 * the first segment and check org membership, so the tenant boundary is the
 * path itself. A file written anywhere else is unreachable, which is the point.
 *
 * The bytes are uploaded straight from the browser with the user's own session,
 * so RLS applies to the object as well as the row, and a large photo never
 * passes through a serverless function.
 */

export type MediaResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done: MediaResult = { ok: true, data: null };

const MEDIA_BUCKET = 'case-media';

/** 500MB matches the bucket limit set in supabase/config.toml. */
const MAX_BYTES = 500 * 1024 * 1024;

/** Strip anything that would make a storage key awkward or ambiguous. */
function safeName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
  return cleaned || 'file';
}

/**
 * Where a file for this case belongs, and whether the caller may put it there.
 * Returns the path only — the browser does the upload.
 */
export async function prepareUpload(input: {
  caseId: string;
  fileName: string;
  size: number;
}): Promise<MediaResult<{ path: string; bucket: string }>> {
  if (!input.fileName?.trim()) return fail('That file has no name.');
  if (input.size > MAX_BYTES) {
    return fail(`That file is ${Math.round(input.size / 1024 / 1024)}MB. The limit is 500MB.`);
  }
  if (input.size === 0) return fail('That file is empty.');

  const supabase = createSupabaseServerClient();

  // Reading the case through RLS is itself the permission check: a user who
  // cannot see the case cannot get a path for it.
  const { data: kase } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!kase) return fail('That case does not exist, or you cannot see it.');

  const unique = crypto.randomUUID().slice(0, 8);
  const path = `${kase.org_id}/${input.caseId}/${unique}-${safeName(input.fileName)}`;

  return { ok: true, data: { path, bucket: MEDIA_BUCKET } };
}

const RegisterInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  storagePath: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().max(120).optional().or(z.literal('')),
  sizeBytes: z.number().int().nonnegative().optional(),
  caption: z.string().trim().max(500).optional().or(z.literal('')),
  capturedAt: z.string().trim().optional().or(z.literal('')),
  // Set when the file was added through a photo or file field on a section,
  // rather than dropped into the library as a whole. This is what lets a
  // storage-backed field count towards its section being complete.
  sectionId: z.string().uuid().optional().nullable(),
  fieldId: z.string().uuid().optional().nullable(),
});

/** Record an uploaded object. Called after the bytes have landed. */
/*
 * Mark-up on a photograph, stored beside the file rather than drawn into it.
 *
 * The uploaded image is the exhibit and stays exactly as uploaded; these shapes
 * are a separate layer that can be corrected or removed. Coordinates are
 * fractions of the image's own size, so the same mark-up lines up on screen and
 * in print.
 */
const Shape = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().max(32),
    kind: z.literal('rect'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stroke: z.number().min(0.5).max(20),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  }),
  z.object({
    id: z.string().max(32),
    kind: z.literal('ellipse'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stroke: z.number().min(0.5).max(20),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  }),
  z.object({
    id: z.string().max(32),
    kind: z.literal('arrow'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stroke: z.number().min(0.5).max(20),
    x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
  }),
  z.object({
    id: z.string().max(32),
    kind: z.literal('free'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stroke: z.number().min(0.5).max(20),
    pts: z.array(z.number()).max(4000),
  }),
  z.object({
    id: z.string().max(32),
    kind: z.literal('text'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    x: z.number(), y: z.number(),
    size: z.number().min(0.005).max(0.5),
    text: z.string().trim().min(1).max(120),
  }),
]);

export async function saveAnnotations(input: {
  id: string;
  caseId: string;
  annotations: unknown[];
}): Promise<MediaResult> {
  const parsed = z.array(Shape).max(200).safeParse(input.annotations);
  if (!parsed.success) return fail('That mark-up could not be saved — it is not a shape we know.');

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('media_files')
    .update({ annotations: parsed.data })
    .eq('id', input.id)
    .select('id');

  if (error) {
    if (error.code === '42501') return fail('Your role does not allow marking up this photograph.');
    return fail(error.message);
  }
  // An UPDATE refused by a USING clause matches nothing and raises no error, so
  // the absence of a row is the refusal.
  if (!data?.length) return fail('Not saved — you do not have write access to this case.');

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}

export async function registerMedia(input: {
  caseId: string;
  fileName: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  caption?: string;
  capturedAt?: string;
  tags?: string[];
  sectionId?: string | null;
  fieldId?: string | null;
}): Promise<MediaResult<{ id: string }>> {
  const parsed = RegisterInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: kase } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!kase) return fail('That case no longer exists.');

  const { data, error } = await supabase
    .from('media_files')
    .insert({
      org_id: kase.org_id as string,
      case_id: input.caseId,
      bucket: MEDIA_BUCKET,
      storage_path: parsed.data.storagePath,
      file_name: parsed.data.fileName,
      mime_type: parsed.data.mimeType || null,
      size_bytes: parsed.data.sizeBytes ?? null,
      caption: parsed.data.caption || null,
      captured_at: parsed.data.capturedAt || null,
      section_id: parsed.data.sectionId ?? null,
      field_id: parsed.data.fieldId ?? null,
      tags: input.tags ?? [],
      uploaded_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    /*
     * The bytes are already in the bucket at this point. Leaving them there
     * with no row would be an invisible file nobody can find or delete through
     * the interface, so the object goes too and the caller is told the upload
     * did not stick.
     */
    await supabase.storage.from(MEDIA_BUCKET).remove([parsed.data.storagePath]);

    if (error.code === '23505') return fail('That file has already been recorded.');
    if (error.code === '42501') return fail('Read-only accounts cannot upload files.');
    return fail(error.message);
  }

  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateMedia(input: {
  id: string;
  caseId: string;
  caption?: string;
  tags?: string[];
  capturedAt?: string | null;
}): Promise<MediaResult> {
  const supabase = createSupabaseServerClient();

  const patch: {
    caption?: string | null;
    tags?: string[];
    captured_at?: string | null;
  } = {};
  if (input.caption !== undefined) patch.caption = input.caption.trim() || null;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.capturedAt !== undefined) patch.captured_at = input.capturedAt || null;

  const { data, error } = await supabase
    .from('media_files')
    .update(patch)
    .eq('id', input.id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not saved — you may not have permission.');

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}

export async function deleteMedia(input: {
  id: string;
  caseId: string;
}): Promise<MediaResult> {
  const supabase = createSupabaseServerClient();

  const { data: file } = await supabase
    .from('media_files')
    .select('storage_path, bucket')
    .eq('id', input.id)
    .maybeSingle();
  if (!file) return fail('That file is already gone.');

  const { data, error } = await supabase
    .from('media_files')
    .delete()
    .eq('id', input.id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — you may not have permission.');

  // Row first, object second. If the object removal fails the file is orphaned
  // in the bucket rather than listed in a case it no longer belongs to, which
  // is the less misleading of the two failures.
  const { error: storageError } = await supabase.storage
    .from((file.bucket as string) ?? MEDIA_BUCKET)
    .remove([file.storage_path as string]);

  revalidatePath(`/cases/${input.caseId}`);

  if (storageError) {
    return fail(
      'The file was removed from the case, but the stored copy could not be deleted. An administrator should clear it from the bucket.',
    );
  }
  return done;
}

/** A named set of files, kept so the document can be reproduced later. */
export async function createMediaLog(input: {
  caseId: string;
  title: string;
  mediaIds: string[];
}): Promise<MediaResult<{ id: string }>> {
  if (input.title.trim().length < 2) return fail('Give the log a title.');
  if (input.mediaIds.length === 0) return fail('Select at least one file.');

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: kase } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!kase) return fail('That case no longer exists.');

  const { data, error } = await supabase
    .from('media_log_reports')
    .insert({
      org_id: kase.org_id as string,
      case_id: input.caseId,
      title: input.title.trim(),
      media_ids: input.mediaIds,
      generated_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') return fail('Read-only accounts cannot generate logs.');
    return fail(error.message);
  }

  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteMediaLog(input: {
  id: string;
  caseId: string;
}): Promise<MediaResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('media_log_reports')
    .delete()
    .eq('id', input.id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — you may not have permission.');

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}
