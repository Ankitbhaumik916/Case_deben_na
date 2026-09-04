'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Case mutations. Run as the signed-in user so RLS decides: a read_only
 * account gets a policy violation here, not a check this file remembered.
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const NewCase = z.object({
  caseNumber: z
    .string()
    .trim()
    .min(2, 'Give the case a number.')
    .max(60, 'That case number is too long.'),
  title: z.string().trim().max(160).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  county: z.string().trim().max(80).optional().or(z.literal('')),
  state: z.string().trim().max(40).optional().or(z.literal('')),
  incidentDate: z.string().trim().optional().or(z.literal('')),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

const CaseDetails = z.object({
  caseId: z.string().uuid(),
  caseNumber: z
    .string()
    .trim()
    .min(2, 'Give the case a number.')
    .max(60, 'That case number is too long.'),
  title: z.string().trim().max(160).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  county: z.string().trim().max(80).optional().or(z.literal('')),
  state: z.string().trim().max(40).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  incidentDate: z.string().trim().optional().or(z.literal('')),
  leadInvestigatorId: z.string().uuid().nullable().optional(),
});

/**
 * Edit the case's own particulars — the things the header shows.
 *
 * Deliberately does not touch lat/lng or status. Position is saved by the map
 * card, which knows how to geocode and how precise a match it got; status moves
 * through enforce_status_transition() so a reviewer-only step stays reviewer-only.
 * Letting this form write either would be a way around both.
 */
export async function updateCaseDetails(input: {
  caseId: string;
  caseNumber: string;
  title?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  county?: string;
  state?: string;
  postalCode?: string;
  incidentDate?: string;
  leadInvestigatorId?: string | null;
}): Promise<ActionResult> {
  const parsed = CaseDetails.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const d = parsed.data;

  const { error } = await supabase
    .from('cases')
    .update({
      case_number: d.caseNumber,
      title: d.title || null,
      address: d.address || null,
      address_line2: d.addressLine2 || null,
      city: d.city || null,
      county: d.county || null,
      state: d.state || null,
      postal_code: d.postalCode || null,
      incident_date: d.incidentDate || null,
      lead_investigator_id: d.leadInvestigatorId || null,
    })
    .eq('id', d.caseId);

  if (error) {
    if (error.code === '23505') {
      return fail(`Case number "${d.caseNumber}" is already used in this organisation.`);
    }
    if (error.code === '42501') {
      return fail('Your role does not allow editing this case.');
    }
    return fail(error.message);
  }

  revalidatePath(`/cases/${d.caseId}`);
  revalidatePath('/cases');
  revalidatePath('/pipeline');
  return { ok: true, data: null };
}

export async function createCase(input: {
  orgId: string;
  caseTypeId: string;
  caseNumber: string;
  title?: string;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  incidentDate?: string;
  lat?: number | null;
  lng?: number | null;
  leadInvestigatorId?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = NewCase.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('cases')
    .insert({
      org_id: input.orgId,
      case_type_id: input.caseTypeId,
      case_number: parsed.data.caseNumber,
      title: parsed.data.title || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      county: parsed.data.county || null,
      state: parsed.data.state || null,
      incident_date: parsed.data.incidentDate || null,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      lead_investigator_id: input.leadInvestigatorId || user?.id || null,
      created_by: user?.id ?? null,
      // status_id is left out on purpose: apply_default_case_status picks the
      // case type's own initial status, falling back to the org-wide one.
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(`Case number "${parsed.data.caseNumber}" is already used in this organisation.`);
    }
    if (error.code === '42501') {
      return fail('Read-only accounts cannot create cases. Ask an administrator for investigator access.');
    }
    return fail(error.message);
  }

  revalidatePath('/cases');
  revalidatePath('/portal');
  return { ok: true, data: { id: data.id as string } };
}
