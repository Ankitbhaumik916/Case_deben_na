'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Statuses, compliance checklists and report structure for a case type.
 *
 * Same rule as the sections editor: everything runs as the signed-in user so
 * the admin-only RLS policies decide, not a check in this file.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const done: ActionResult = { ok: true, data: null };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function keyFrom(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function refresh(caseTypeId: string) {
  revalidatePath(`/admin/case-types/${caseTypeId}`);
  revalidatePath('/admin/case-types');
}

/** case_statuses.org_id is NOT NULL; read it from the parent rather than relying on a trigger. */
async function orgOf(caseTypeId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('case_types')
    .select('org_id')
    .eq('id', caseTypeId)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

/* ============================================================== statuses === */

export async function createStatus(input: {
  caseTypeId: string;
  label: string;
  color: string;
  isInitial?: boolean;
  isTerminal?: boolean;
  requiresReview?: boolean;
}): Promise<ActionResult> {
  if (input.label.trim().length < 2) return fail('Give the status a label.');

  const orgId = await orgOf(input.caseTypeId);
  if (!orgId) return fail('That case type no longer exists.');

  const supabase = createSupabaseServerClient();
  const key = keyFrom(input.label);
  if (!key) return fail('That label does not make a valid key.');

  const { data: last } = await supabase
    .from('case_statuses')
    .select('sort_order')
    .eq('case_type_id', input.caseTypeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Only one status can be where a new case starts.
  if (input.isInitial) {
    await supabase
      .from('case_statuses')
      .update({ is_initial: false })
      .eq('case_type_id', input.caseTypeId);
  }

  const { error } = await supabase.from('case_statuses').insert({
    org_id: orgId,
    case_type_id: input.caseTypeId,
    key,
    label: input.label.trim(),
    color: input.color,
    sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
    is_initial: Boolean(input.isInitial),
    is_terminal: Boolean(input.isTerminal),
    requires_review_role: Boolean(input.requiresReview),
  });

  if (error) {
    if (error.code === '23505') return fail(`This case type already has a status keyed "${key}".`);
    if (error.code === '42501') return fail('Only an administrator can change statuses.');
    return fail(error.message);
  }

  refresh(input.caseTypeId);
  return done;
}

export async function updateStatus(
  id: string,
  caseTypeId: string,
  patch: {
    label?: string;
    color?: string;
    is_initial?: boolean;
    is_terminal?: boolean;
    requires_review_role?: boolean;
    is_active?: boolean;
  },
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  if (patch.is_initial) {
    await supabase
      .from('case_statuses')
      .update({ is_initial: false })
      .eq('case_type_id', caseTypeId);
  }

  const { data, error } = await supabase
    .from('case_statuses')
    .update(patch)
    .eq('id', id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not saved — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function deleteStatus(id: string, caseTypeId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  // cases.status_id is ON DELETE RESTRICT; explain rather than surface 23503.
  const { count } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('status_id', id);

  if ((count ?? 0) > 0) {
    return fail(
      `${count} case${count === 1 ? ' is' : 's are'} sitting in this status. Move them first, or deactivate it instead.`,
    );
  }

  const { data, error } = await supabase.from('case_statuses').delete().eq('id', id).select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function moveStatus(
  id: string,
  caseTypeId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data: rows } = await supabase
    .from('case_statuses')
    .select('id')
    .eq('case_type_id', caseTypeId)
    .order('sort_order');

  if (!rows?.length) return done;
  const index = rows.findIndex((r) => r.id === id);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= rows.length) return done;

  await supabase.from('case_statuses').update({ sort_order: swapWith }).eq('id', rows[index].id as string);
  await supabase.from('case_statuses').update({ sort_order: index }).eq('id', rows[swapWith].id as string);

  refresh(caseTypeId);
  return done;
}

/* ============================================================ checklists === */

export async function createChecklist(input: {
  caseTypeId: string;
  name: string;
  sourceStandard?: string;
  version?: string;
}): Promise<ActionResult<{ id: string }>> {
  if (input.name.trim().length < 2) return fail('Give the checklist a name.');

  const orgId = await orgOf(input.caseTypeId);
  if (!orgId) return fail('That case type no longer exists.');

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_type_checklists')
    .insert({
      org_id: orgId,
      case_type_id: input.caseTypeId,
      name: input.name.trim(),
      source_standard: input.sourceStandard?.trim() || null,
      version: input.version?.trim() || null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') return fail('Only an administrator can change checklists.');
    return fail(error.message);
  }

  refresh(input.caseTypeId);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteChecklist(id: string, caseTypeId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  const { data: items } = await supabase.from('checklist_items').select('id').eq('checklist_id', id);
  const itemIds = (items ?? []).map((i) => i.id as string);

  if (itemIds.length) {
    const { count } = await supabase
      .from('case_checklist_responses')
      .select('id', { count: 'exact', head: true })
      .in('item_id', itemIds);
    if ((count ?? 0) > 0) {
      return fail(
        `${count} tick${count === 1 ? '' : 's'} recorded against this checklist on real cases would be deleted with it.`,
      );
    }
  }

  const { data, error } = await supabase
    .from('case_type_checklists')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function createChecklistItem(input: {
  checklistId: string;
  caseTypeId: string;
  label: string;
  sectionRef?: string;
  isRequired?: boolean;
}): Promise<ActionResult> {
  if (input.label.trim().length < 3) return fail('Write out the check in full.');

  const supabase = createSupabaseServerClient();
  const { data: parent } = await supabase
    .from('case_type_checklists')
    .select('org_id')
    .eq('id', input.checklistId)
    .maybeSingle();
  if (!parent) return fail('That checklist no longer exists.');

  const { data: last } = await supabase
    .from('checklist_items')
    .select('sort_order')
    .eq('checklist_id', input.checklistId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('checklist_items').insert({
    org_id: parent.org_id as string,
    checklist_id: input.checklistId,
    label: input.label.trim(),
    section_ref: input.sectionRef || null,
    is_required: input.isRequired ?? true,
    sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
  });

  if (error) {
    if (error.code === '42501') return fail('Only an administrator can change checklists.');
    return fail(error.message);
  }

  refresh(input.caseTypeId);
  return done;
}

export async function deleteChecklistItem(id: string, caseTypeId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  const { count } = await supabase
    .from('case_checklist_responses')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', id);

  if ((count ?? 0) > 0) {
    return fail(`${count} case${count === 1 ? '' : 's'} already answered this check.`);
  }

  const { data, error } = await supabase.from('checklist_items').delete().eq('id', id).select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

/* ======================================================= report template === */

export async function createReportSection(input: {
  caseTypeId: string;
  heading: string;
  sourceSectionIds: string[];
  draftPrompt?: string;
}): Promise<ActionResult> {
  if (input.heading.trim().length < 2) return fail('Give the report section a heading.');

  const orgId = await orgOf(input.caseTypeId);
  if (!orgId) return fail('That case type no longer exists.');

  const supabase = createSupabaseServerClient();
  const { data: last } = await supabase
    .from('case_type_report_sections')
    .select('sort_order')
    .eq('case_type_id', input.caseTypeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('case_type_report_sections').insert({
    org_id: orgId,
    case_type_id: input.caseTypeId,
    heading: input.heading.trim(),
    source_section_ids: input.sourceSectionIds,
    draft_prompt: input.draftPrompt?.trim() || null,
    sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
  });

  if (error) {
    if (error.code === '42501') return fail('Only an administrator can change the report template.');
    return fail(error.message);
  }

  refresh(input.caseTypeId);
  return done;
}

export async function updateReportSection(
  id: string,
  caseTypeId: string,
  patch: {
    heading?: string;
    draft_prompt?: string | null;
    source_section_ids?: string[];
    include_by_default?: boolean;
  },
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_type_report_sections')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not saved — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function deleteReportSection(id: string, caseTypeId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  // case_report_section_drafts cascades from this row, so deleting a section
  // somebody has already written against destroys their text without saying so.
  // Every other delete in the template refuses on the same grounds; this one
  // was the exception.
  const { count } = await supabase
    .from('case_report_section_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('report_section_id', id);

  if ((count ?? 0) > 0) {
    return fail(
      `${count} case${count === 1 ? ' has' : 's have'} written against this section. Deleting it would delete what they wrote — take it out of the template only once those cases are closed out.`,
    );
  }

  const { data, error } = await supabase
    .from('case_type_report_sections')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function moveReportSection(
  id: string,
  caseTypeId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data: rows } = await supabase
    .from('case_type_report_sections')
    .select('id')
    .eq('case_type_id', caseTypeId)
    .order('sort_order');

  if (!rows?.length) return done;
  const index = rows.findIndex((r) => r.id === id);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= rows.length) return done;

  await supabase
    .from('case_type_report_sections')
    .update({ sort_order: swapWith })
    .eq('id', rows[index].id as string);
  await supabase
    .from('case_type_report_sections')
    .update({ sort_order: index })
    .eq('id', rows[swapWith].id as string);

  refresh(caseTypeId);
  return done;
}
