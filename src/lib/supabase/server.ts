import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Carries the caller's session, so every query it makes is subject to RLS —
 * this is the client almost everything should use.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. The middleware refreshes
            // the session on every request, so this is safe to swallow.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely — every policy written in
 * migration 0012 is void for anything using this.
 *
 * Only for work that genuinely has no user behind it: background transcription
 * jobs, admin provisioning, scheduled retention sweeps. Never construct it in
 * response to a user request without checking that user's rights first, and
 * never import it into a Client Component.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
