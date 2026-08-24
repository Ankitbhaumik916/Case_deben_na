'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Where a case happened.
 *
 * lat/lng are columns on cases rather than configurable fields, because the map
 * has to read them the same way for every discipline — a burglary and a fire
 * both plot the same. That means they need somewhere to be edited, which is
 * what this is.
 */

export type LocationResult =
  | { ok: true; lat: number | null; lng: number | null; label?: string }
  | { ok: false; error: string };

const Coords = z.object({
  lat: z.number().min(-90, 'Latitude runs from -90 to 90.').max(90, 'Latitude runs from -90 to 90.'),
  lng: z
    .number()
    .min(-180, 'Longitude runs from -180 to 180.')
    .max(180, 'Longitude runs from -180 to 180.'),
});

export async function saveLocation(input: {
  caseId: string;
  lat: number | null;
  lng: number | null;
}): Promise<LocationResult> {
  // Clearing both together is how a case is taken off the map.
  if (input.lat !== null || input.lng !== null) {
    const parsed = Coords.safeParse({ lat: input.lat, lng: input.lng });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('cases')
    .update({ lat: input.lat, lng: input.lng })
    .eq('id', input.caseId)
    .select('lat, lng');

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'Read-only access — the location was not saved.' };
    }
    return { ok: false, error: error.message };
  }
  if (!data?.length) return { ok: false, error: 'Not saved — you may not have permission.' };

  revalidatePath(`/cases/${input.caseId}`);
  revalidatePath('/cases');
  return { ok: true, lat: data[0].lat as number | null, lng: data[0].lng as number | null };
}

/**
 * Look up coordinates from the address already on the case.
 *
 * Nominatim is OpenStreetMap's own geocoder: free, no key, and covered by a
 * usage policy that asks for at most one request a second and a User-Agent that
 * identifies the caller. Both are honoured here, and it runs on the server so
 * the policy is not left to the browser.
 *
 * It returns a suggestion, deliberately — nothing is written until a person
 * looks at it and accepts. A geocoder guessing at "Main Street" is not the
 * thing to silently pin a forensic case file to.
 */
export async function geocodeCase(caseId: string): Promise<LocationResult> {
  const supabase = createSupabaseServerClient();

  const { data: kase } = await supabase
    .from('cases')
    .select('address, city, county, state')
    .eq('id', caseId)
    .maybeSingle();

  if (!kase) return { ok: false, error: 'That case no longer exists.' };

  const query = [kase.address, kase.city, kase.county, kase.state]
    .filter(Boolean)
    .join(', ')
    .trim();

  if (!query) {
    return { ok: false, error: 'This case has no address to look up. Add one, or type the coordinates.' };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': 'Forensibus/0.1 (forensic case management)' },
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    return {
      ok: false,
      error: 'The geocoding service could not be reached. Type the coordinates instead.',
    };
  }

  if (!response.ok) {
    return { ok: false, error: `The geocoding service answered ${response.status}.` };
  }

  const results = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  if (!results?.length) {
    return {
      ok: false,
      error: `Nothing found for “${query}”. Try a coarser address, or type the coordinates.`,
    };
  }

  return {
    ok: true,
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    label: results[0].display_name,
  };
}
