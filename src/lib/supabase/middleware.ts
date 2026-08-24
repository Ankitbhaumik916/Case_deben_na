import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/**
 * Routes reachable without a session.
 *
 * '/' is the marketing page and '/landing' holds its stylesheet, script and
 * images. Those asset requests pass through this middleware too, so omitting
 * '/landing' would bounce the landing page's own CSS to /login and serve it
 * unstyled.
 */
const PUBLIC_PATHS = ['/', '/landing', '/login', '/auth'];

/** Where a signed-in user belongs. The app home is no longer '/'. */
export const APP_HOME = '/portal';

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the auth cookie on every request and gates the app behind a
 * session. Auth lives here rather than in each page so a new route is
 * protected by default instead of by remembering to add a check.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates against the auth server; getSession() only decodes
  // the cookie and must not be trusted for an access decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Come back to where they were headed once signed in.
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = APP_HOME;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
