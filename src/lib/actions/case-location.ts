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
  | {
      ok: true;
      lat: number | null;
      lng: number | null;
      label?: string;
      /** The form of the address that actually matched. */
      matchedOn?: string;
      /** How precise the matched feature is, in plain words. */
      precision?: string;
      /** What kind of thing was matched — "city", "road", "railway halt". */
      kind?: string;
      /** True only for a genuine address-level match. */
      precise?: boolean;
    }
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

  /*
   * Try progressively coarser, because a full street address often does not
   * match. A real one from this system:
   *
   *   "House no 4, Bharathidasan street, potheri, Chengalpattu, Chennai,
   *    Tamil Nadu" -> no match
   *   "potheri, Chengalpattu, Tamil Nadu"                -> 12.8208, 80.0369
   *
   * The first version asked once and gave up, which for that address meant the
   * feature simply did not work. Dropping the leading part of the address one
   * comma at a time gets to something the gazetteer knows, and the answer says
   * which form matched so nobody assumes house-number precision they did not
   * get.
   */
  const parts = [kase.address, kase.city, kase.county, kase.state]
    .filter(Boolean)
    .join(', ')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // De-duplicate: "…, Tamil Nadu, Tamil Nadu" is what a state field plus a
  // state already typed into the address produces.
  const seen = new Set<string>();
  const cleaned = parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (cleaned.length === 0) {
    return {
      ok: false,
      error: 'This case has no address to look up. Add one, or type the coordinates.',
    };
  }

  // Full address first, then drop the most specific element each time.
  const attempts: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    attempts.push(cleaned.slice(i).join(', '));
  }

  for (const [index, query] of attempts.entries()) {
    // Nominatim's usage policy asks for at most one request a second.
    if (index > 0) await new Promise((r) => setTimeout(r, 1100));

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

    if (!response.ok) continue;

    const results = (await response.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      place_rank?: number;
      class?: string;
      type?: string;
      addresstype?: string;
    }[];

    if (results?.length) {
      const hit = results[0];
      const rank = hit.place_rank ?? 0;

      /*
       * Report what the gazetteer actually resolved to, not merely whether the
       * first query matched. Those are different things, and conflating them
       * misleads: "potheri, Chengalpattu, Tamil Nadu" comes back at rank 30,
       * which looks pin-sharp — but it is a railway halt named Potheri, not
       * anybody's address. Saying so is the difference between a coordinate
       * someone can rely on and one they merely believe.
       */
      const precision =
        rank >= 30 ? 'a specific place' :
        rank >= 26 ? 'a street' :
        rank >= 20 ? 'a neighbourhood' :
        rank >= 16 ? 'a town or city' :
        'a district or larger';

      const kind = (hit.addresstype ?? hit.type ?? hit.class ?? 'place').replace(/_/g, ' ');
      const addressLike = ['building', 'house', 'place', 'address', 'amenity', 'shop', 'office'];

      return {
        ok: true,
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        label: hit.display_name,
        matchedOn: query,
        precision,
        kind,
        precise: rank >= 30 && addressLike.includes(kind),
      };
    }
  }

  return {
    ok: false,
    error: `Nothing was found for this address, even after trying coarser forms of it. Type the coordinates instead — right-click the spot in any map app to copy them.`,
  };
}
