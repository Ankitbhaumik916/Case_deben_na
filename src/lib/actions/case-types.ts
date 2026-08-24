'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Case Type Builder mutations.
 *
 * Every one of these runs as the signed-in user, NOT the service role. That is
 * deliberate: the admin-only RLS policies from migration 0012 are what decide
 * whether the write lands, so there is no privileged path around them and no
 * second copy of the permission rules to keep in sync. An investigator calling
 * these gets a policy violation from Postgres, not a check we remembered to
 * write.
 */

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const keyPattern = /^[a-z0-9_]+$/;
const hexPattern = /^#[0-9a-fA-F]{6}$/;

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const done: ActionResult = { ok: true, data: null };

/** Turns "Vehicle Theft" into "vehicle-theft". */
export async function slugify(value: string): Promise<string> {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function localSlugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function refresh(caseTypeId?: string) {
  revalidatePath('/admin/case-types');
  if (caseTypeId) revalidatePath(`/admin/case-types/${caseTypeId}`);
  revalidatePath('/portal');
}

/* ============================================================ case types === */

const CaseTypeInput = z.object({
  name: z.string().trim().min(2, 'Give the case type a name.').max(80),
  slug: z
    .string()
    .trim()
    .regex(slugPattern, 'Use lowercase letters, numbers and hyphens.')
    .max(60)
    .optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  icon: z.string().trim().max(40).optional(),
  color: z.string().trim().regex(hexPattern, 'Pick a colour.').optional(),
});

export async function createCaseType(input: {
  orgId: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = CaseTypeInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const slug = parsed.data.slug || localSlugify(parsed.data.name);
  if (!slugPattern.test(slug)) return fail('That name does not make a valid slug — set one manually.');

  const { data, error } = await supabase
    .from('case_types')
    .insert({
      org_id: input.orgId,
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      icon: parsed.data.icon || 'folder',
      color: parsed.data.color || '#2563eb',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return fail(`A case type with the slug "${slug}" already exists.`);
    if (error.code === '42501') return fail('Only an administrator can create case types.');
    return fail(error.message);
  }

  refresh();
  return { ok: true, data: { id: data.id as string } };
}

export async function updateCaseType(
  id: string,
  patch: { name?: string; description?: string | null; icon?: string; color?: string; is_active?: boolean },
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_types')
    .update(patch)
    .eq('id', id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not saved — you may not have administrator rights in this organisation.');

  refresh(id);
  return done;
}

export async function duplicateCaseType(
  id: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = createSupabaseServerClient();
  const slug = localSlugify(name);
  if (!slugPattern.test(slug)) return fail('Give the copy a name that makes a valid slug.');

  // Whole-template clone lives in SQL (migration 0014) so the builder, the seed
  // and any future import path all copy a discipline the same way.
  const { data, error } = await supabase.rpc('duplicate_case_type', {
    p_case_type_id: id,
    p_new_name: name,
    p_new_slug: slug,
  });

  if (error) {
    if (error.code === '23505') return fail(`A case type with the slug "${slug}" already exists.`);
    return fail(error.message);
  }

  refresh();
  return { ok: true, data: { id: data as string } };
}

export async function deleteCaseType(id: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  // cases.case_type_id is ON DELETE RESTRICT, so the database would refuse
  // anyway — but "in use by 3 cases" beats a foreign key error string.
  const { count } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('case_type_id', id);

  if ((count ?? 0) > 0) {
    return fail(
      `${count} case${count === 1 ? '' : 's'} still use this type. Deactivate it instead — existing cases keep working and it stops appearing on new ones.`,
    );
  }

  const { data, error } = await supabase.from('case_types').delete().eq('id', id).select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');

  refresh();
  return done;
}

/* ============================================================== sections === */

const SectionInput = z.object({
  label: z.string().trim().min(2, 'Give the section a label.').max(80),
  key: z.string().trim().regex(keyPattern, 'Use lowercase letters, numbers and underscores.').max(60).optional(),
  icon: z.string().trim().max(40).optional(),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  tabKey: z.string().trim().regex(/^[a-z0-9_]+$/).max(40).optional(),
  tabLabel: z.string().trim().max(40).optional(),
  isRequired: z.boolean().optional(),
  completionRule: z
    .enum(['any_field_filled', 'all_fields_filled', 'all_required_fields_filled', 'manual'])
    .optional(),
});

export async function createSection(input: {
  caseTypeId: string;
  label: string;
  key?: string;
  icon?: string;
  tabKey?: string;
  tabLabel?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = SectionInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const key = parsed.data.key || localSlugify(parsed.data.label).replace(/-/g, '_');
  if (!keyPattern.test(key)) return fail('That label does not make a valid key — set one manually.');

  const { data: parent } = await supabase
    .from('case_types')
    .select('org_id')
    .eq('id', input.caseTypeId)
    .maybeSingle();
  if (!parent) return fail('That case type no longer exists.');

  const { data: last } = await supabase
    .from('case_type_sections')
    .select('sort_order')
    .eq('case_type_id', input.caseTypeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('case_type_sections')
    .insert({
      org_id: parent.org_id as string,
      case_type_id: input.caseTypeId,
      key,
      label: parsed.data.label,
      icon: parsed.data.icon || 'circle',
      tab_key: parsed.data.tabKey || 'documentation',
      tab_label: parsed.data.tabLabel || 'Documentation',
      sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return fail(`This case type already has a section keyed "${key}".`);
    if (error.code === '42501') return fail('Only an administrator can edit case types.');
    return fail(error.message);
  }

  refresh(input.caseTypeId);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSection(
  id: string,
  caseTypeId: string,
  patch: {
    label?: string;
    icon?: string;
    description?: string | null;
    tab_key?: string;
    tab_label?: string;
    is_required?: boolean;
    completion_rule?: 'any_field_filled' | 'all_fields_filled' | 'all_required_fields_filled' | 'manual';
  },
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('case_type_sections')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not saved — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function deleteSection(id: string, caseTypeId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  // Field values cascade with the section. Say so plainly before it happens.
  const { count } = await supabase
    .from('case_field_values')
    .select('id', { count: 'exact', head: true })
    .in(
      'field_id',
      (
        await supabase.from('case_type_fields').select('id').eq('section_id', id)
      ).data?.map((f) => f.id as string) ?? ['00000000-0000-0000-0000-000000000000'],
    );

  if ((count ?? 0) > 0) {
    return fail(
      `${count} answer${count === 1 ? '' : 's'} recorded on real cases would be deleted with this section. Remove it from the template only once those cases are closed out.`,
    );
  }

  const { data, error } = await supabase.from('case_type_sections').delete().eq('id', id).select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

/** Swaps a section with its neighbour. Keyboard-reachable, unlike a drag handle. */
export async function moveSection(
  id: string,
  caseTypeId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data: rows } = await supabase
    .from('case_type_sections')
    .select('id, sort_order')
    .eq('case_type_id', caseTypeId)
    .order('sort_order');

  if (!rows?.length) return fail('Nothing to reorder.');

  const index = rows.findIndex((r) => r.id === id);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= rows.length) return done;

  const a = rows[index];
  const b = rows[swapWith];

  // sort_order values can collide or have gaps; write positions, not deltas.
  await supabase.from('case_type_sections').update({ sort_order: swapWith }).eq('id', a.id as string);
  await supabase.from('case_type_sections').update({ sort_order: index }).eq('id', b.id as string);

  refresh(caseTypeId);
  return done;
}

/* ================================================================ fields === */

const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'photo',
  'file',
  'signature',
  'boolean',
  'person_ref',
  'computed',
] as const;

const FieldInput = z.object({
  label: z.string().trim().min(1, 'Give the field a label.').max(80),
  key: z.string().trim().regex(keyPattern).max(60).optional(),
  fieldType: z.enum(FIELD_TYPES),
  helpText: z.string().trim().max(300).optional().or(z.literal('')),
  placeholder: z.string().trim().max(120).optional().or(z.literal('')),
  width: z.enum(['full', 'half', 'third']).optional(),
  required: z.boolean().optional(),
  choices: z.string().optional(),
});

/** "Accidental, Incendiary" -> [{value:'accidental',label:'Accidental'}, …] */
function parseChoices(raw: string | undefined) {
  if (!raw?.trim()) return undefined;
  const choices = raw
    .split(/[\n,]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((label) => ({ value: localSlugify(label).replace(/-/g, '_') || label, label }));
  return choices.length ? { choices } : undefined;
}

export async function createField(input: {
  sectionId: string;
  caseTypeId: string;
  label: string;
  fieldType: (typeof FIELD_TYPES)[number];
  key?: string;
  helpText?: string;
  placeholder?: string;
  width?: 'full' | 'half' | 'third';
  required?: boolean;
  choices?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = FieldInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const needsChoices = input.fieldType === 'select' || input.fieldType === 'multiselect';
  const options = parseChoices(input.choices);
  if (needsChoices && !options) return fail('A select field needs at least one choice.');

  const supabase = createSupabaseServerClient();
  const key = parsed.data.key || localSlugify(parsed.data.label).replace(/-/g, '_');
  if (!keyPattern.test(key)) return fail('That label does not make a valid key — set one manually.');

  const { data: parentSection } = await supabase
    .from('case_type_sections')
    .select('org_id')
    .eq('id', input.sectionId)
    .maybeSingle();
  if (!parentSection) return fail('That section no longer exists.');

  const { data: last } = await supabase
    .from('case_type_fields')
    .select('sort_order')
    .eq('section_id', input.sectionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('case_type_fields')
    .insert({
      org_id: parentSection.org_id as string,
      section_id: input.sectionId,
      key,
      label: parsed.data.label,
      field_type: input.fieldType,
      options: options ?? {},
      validation: input.required ? { required: true } : {},
      help_text: input.helpText || null,
      placeholder: input.placeholder || null,
      width: input.width ?? 'full',
      sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return fail(`This section already has a field keyed "${key}".`);
    if (error.code === '42501') return fail('Only an administrator can edit case types.');
    return fail(error.message);
  }

  refresh(input.caseTypeId);
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteField(id: string, caseTypeId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();

  const { count } = await supabase
    .from('case_field_values')
    .select('id', { count: 'exact', head: true })
    .eq('field_id', id);

  if ((count ?? 0) > 0) {
    return fail(
      `${count} case${count === 1 ? '' : 's'} already answered this field. Deleting it would delete those answers.`,
    );
  }

  const { data, error } = await supabase.from('case_type_fields').delete().eq('id', id).select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — administrator rights are required.');
  refresh(caseTypeId);
  return done;
}

export async function moveField(
  id: string,
  sectionId: string,
  caseTypeId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data: rows } = await supabase
    .from('case_type_fields')
    .select('id, sort_order')
    .eq('section_id', sectionId)
    .order('sort_order');

  if (!rows?.length) return fail('Nothing to reorder.');
  const index = rows.findIndex((r) => r.id === id);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= rows.length) return done;

  await supabase.from('case_type_fields').update({ sort_order: swapWith }).eq('id', rows[index].id as string);
  await supabase.from('case_type_fields').update({ sort_order: index }).eq('id', rows[swapWith].id as string);

  refresh(caseTypeId);
  return done;
}
