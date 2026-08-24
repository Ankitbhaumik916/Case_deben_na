import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
        /*
     * Everything except static assets and the marketing page's own files.
     *
     * Every pass through here costs an auth round trip to Supabase, so it is
     * worth being precise about what needs one. /landing holds the marketing
     * page's CSS, JS and images: public by definition, and there is nothing to
     * gate.
     */
    '/((?!_next/static|_next/image|favicon.ico|landing/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4)$).*)',
  ],
};
