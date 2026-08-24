'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Evidence items and their custody ledger.
 *
 * The ledger is the record; evidence_items.current_status and current_location
 * are a convenience that the sync_evidence_current_state trigger keeps in step
 * with the newest event (migration 0005). Nothing here writes them directly —
 * if it did, the headline could disagree with the timeline beneath it, which on
 * a chain of custody is the one thing that must never happen.
 *
 * Everything runs as the signed-in user, so RLS decides.
 */

export type EvidenceResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done: EvidenceResult = { ok: true, data: null };

const EVENT_TYPES = [
  'collected',
  'transferred',
  'released',
  'received',
  'returned',
  'destroyed',
] as const;

const ItemInput = z.object({
  itemNumber: z.string().trim().min(1, 'Give the item a number.').max(40),
  description: z.string().trim().min(3, 'Describe the item.').max(500),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  collectedFrom: z.string().trim().max(200).optional().or(z.literal('')),
  collectedBy: z.string().trim().max(120).optional().or(z.literal('')),
  collectedAt: z.string().trim().optional().or(z.literal('')),
  examRequested: z.string().trim().max(200).optional().or(z.literal('')),
});

export async function createEvidence(input: {
  caseId: string;
  itemNumber: string;
  description: string;
  category?: string;
  collectedFrom?: string;
  collectedBy?: string;
  collectedAt?: string;
  examRequested?: string;
  /** Opening the ledger with the collection itself, which is the normal case. */
  logCollection?: boolean;
}): Promise<EvidenceResult<{ id: string }>> {
  const parsed = ItemInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: parent } = await supabase
    .from('cases')
    .select('org_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!parent) return fail('That case no longer exists.');

  const collectedAt = parsed.data.collectedAt ? new Date(parsed.data.collectedAt).toISOString() : null;

  const { data, error } = await supabase
    .from('evidence_items')
    .insert({
      org_id: parent.org_id as string,
      case_id: input.caseId,
      item_number: parsed.data.itemNumber,
      description: parsed.data.description,
      category: parsed.data.category || null,
      collected_from: parsed.data.collectedFrom || null,
      collected_by: parsed.data.collectedBy || null,
      collected_at: collectedAt,
      exam_requested: parsed.data.examRequested || null,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail(`This case already has an item numbered "${parsed.data.itemNumber}".`);
    }
    if (error.code === '42501') return fail('Read-only accounts cannot record evidence.');
    return fail(error.message);
  }

  // An item that exists but has no ledger entry is a gap in the chain. Open it
  // with the collection unless the caller says otherwise.
  if (input.logCollection !== false) {
    await supabase.from('custody_events').insert({
      org_id: parent.org_id as string,
      evidence_id: data.id as string,
      event_type: 'collected',
      actor_name: parsed.data.collectedBy || 'Not recorded',
      location: parsed.data.collectedFrom || null,
      occurred_at: collectedAt ?? new Date().toISOString(),
      recorded_by: user?.id ?? null,
    });
  }

  revalidatePath(`/cases/${input.caseId}`);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateEvidence(
  id: string,
  caseId: string,
  patch: {
    item_number?: string;
    description?: string;
    category?: string | null;
    collected_from?: string | null;
    exam_requested?: string | null;
    disposition?: string | null;
    notes?: string | null;
  },
): Promise<EvidenceResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('evidence_items')
    .update(patch)
    .eq('id', id)
    .select('id');

  if (error) {
    if (error.code === '23505') return fail('Another item on this case already has that number.');
    return fail(error.message);
  }
  if (!data?.length) return fail('Not saved — you may not have permission.');

  revalidatePath(`/cases/${caseId}`);
  return done;
}

export async function deleteEvidence(id: string, caseId: string): Promise<EvidenceResult> {
  const supabase = createSupabaseServerClient();

  const { count } = await supabase
    .from('custody_events')
    .select('id', { count: 'exact', head: true })
    .eq('evidence_id', id);

  // Deleting an item cascades its ledger. On a chain of custody that is
  // destroying the record of who held what, so it is refused once there is more
  // than the opening entry — mark a disposition instead.
  if ((count ?? 0) > 1) {
    return fail(
      `This item has ${count} custody entries. Deleting it would destroy that chain — record its disposition instead.`,
    );
  }

  const { data, error } = await supabase
    .from('evidence_items')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return fail(error.message);
  if (!data?.length) return fail('Not deleted — you may not have permission.');

  revalidatePath(`/cases/${caseId}`);
  return done;
}

/* ============================================================== custody === */

const EventInput = z.object({
  eventType: z.enum(EVENT_TYPES),
  actorName: z.string().trim().min(2, 'Who handled it?').max(120),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  occurredAt: z.string().trim().min(1, 'When did it happen?'),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export async function addCustodyEvent(input: {
  evidenceId: string;
  caseId: string;
  eventType: (typeof EVENT_TYPES)[number];
  actorName: string;
  location?: string;
  occurredAt: string;
  notes?: string;
}): Promise<EvidenceResult> {
  const parsed = EventInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: parent } = await supabase
    .from('evidence_items')
    .select('org_id')
    .eq('id', input.evidenceId)
    .maybeSingle();
  if (!parent) return fail('That evidence item no longer exists.');

  const { error } = await supabase.from('custody_events').insert({
    org_id: parent.org_id as string,
    evidence_id: input.evidenceId,
    event_type: parsed.data.eventType,
    actor_name: parsed.data.actorName,
    location: parsed.data.location || null,
    occurred_at: new Date(parsed.data.occurredAt).toISOString(),
    notes: parsed.data.notes || null,
    recorded_by: user?.id ?? null,
  });

  if (error) {
    if (error.code === '42501') return fail('Read-only accounts cannot add custody entries.');
    return fail(error.message);
  }

  revalidatePath(`/cases/${input.caseId}`);
  return done;
}

export async function deleteCustodyEvent(
  id: string,
  caseId: string,
): Promise<EvidenceResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('custody_events')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return fail(error.message);
  if (!data?.length) return fail('Not removed — you may not have permission.');

  revalidatePath(`/cases/${caseId}`);
  return done;
}
