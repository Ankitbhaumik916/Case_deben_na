/**
 * Route smoke test. Needs a server already running on BASE (npm run build &&
 * npm start, or npm run dev), and the local Supabase stack up.
 *
 *   npm run verify:routes
 *
 * Walks the real path a visitor takes:
 *   /  ->  click Sign In  ->  /login  ->  sign in  ->  /portal  ->  app routes
 * against the production server, using cookies produced by @supabase/ssr
 * itself rather than a hand-rolled imitation of them.
 */
import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';

const BASE = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100';

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  const body = res.status < 300 ? await res.text() : '';
  return { status: res.status, location: res.headers.get('location'), body };
}

// ---------------------------------------------------------------- step 1: /
console.log('\nSTEP 1  GET /  (the landing page, no session)');
const root = await get('/');
check(root.status === 200, 'returns 200', String(root.status));
check(/Every Case Type/.test(root.body), 'renders the marketing headline');
check(!/Welcome back/.test(root.body), 'is NOT the app portal');
check(/Figures pending/.test(root.body), 'stat placeholders intact');

console.log('\n        landing assets resolve under the same origin');
for (const p of ['/landing/styles.css', '/landing/main.js', '/landing/assets/logo.svg']) {
  const r = await get(p);
  check(r.status === 200, p, String(r.status));
}

// -------------------------------------------------------- step 2: the button
console.log('\nSTEP 2  the Sign In control points into the app');
const hrefs = [...root.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
check(hrefs.includes('/login'), 'a link to /login exists in the markup');
const loginLinks = hrefs.filter((h) => h === '/login').length;
check(loginLinks >= 2, 'header pill AND hero CTA both target /login', `${loginLinks} found`);
check(
  !hrefs.some((h) => /^https?:\/\/(127\.0\.0\.1|localhost)/.test(h)),
  'no hardcoded dev host leaked into the markup',
);

// ----------------------------------------------------------- step 2b: /signup
console.log('');
console.log('STEP 2b registration is reachable and does what it says');
const signupPage = await get('/signup');
check(signupPage.status === 200, '/signup returns 200', String(signupPage.status));
check(
  /Create your account/.test(signupPage.body) || /Registration is closed/.test(signupPage.body),
  'renders either the form or the closed notice',
);
check(hrefs.includes('/signup'), 'the landing CTA points at /signup');

// ------------------------------------------------------------ step 3: /login
console.log('\nSTEP 3  GET /login  (signed out)');
const login = await get('/login');
check(login.status === 200, 'returns 200', String(login.status));
check(/Sign in<\/h1>/.test(login.body), 'renders the sign-in form');
check(!/northgate\.test/.test(login.body), 'demo panel stripped in production build');

console.log('\n        a protected route bounces to /login and remembers where');
const portalOut = await get('/portal');
check(portalOut.status === 307, '/portal redirects when signed out', String(portalOut.status));
check(
  (portalOut.location || '').includes('/login'),
  'redirect target is /login',
  portalOut.location || '',
);
check(
  (portalOut.location || '').includes('next=%2Fportal') ||
    (portalOut.location || '').includes('next=/portal'),
  'carries ?next=/portal so sign-in returns there',
);

// ------------------------------------------------------------- step 4: auth
console.log('\nSTEP 4  sign in  (cookies produced by @supabase/ssr, not faked)');
const jar = new Map();
const supabase = createServerClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  },
);

const { data: session, error } = await supabase.auth.signInWithPassword({
  email: 'ines.vargas@northgate.test',
  password: env.SEED_DEMO_PASSWORD || 'forensibus-demo-1234',
});
check(!error, 'credentials accepted', error ? error.message : session.user.email);
check(jar.size > 0, 'session cookie written', `${jar.size} cookie(s): ${[...jar.keys()].join(', ')}`);

const cookieHeader = [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; ');

// ----------------------------------------------------------- step 5: /portal
console.log('\nSTEP 5  GET /portal  (with that session)');
const portal = await get('/portal', cookieHeader);
check(portal.status === 200, 'returns 200', String(portal.status));
check(/Welcome back/.test(portal.body), 'renders the portal greeting');
check(/Investigation/.test(portal.body), 'renders live case-type tiles from the database');
check(/Fire Investigation/.test(portal.body), 'both seeded case types present');
check(/Forensibus/.test(portal.body), 'app shell / top nav rendered');

console.log('\nSTEP 6  the rest of the app resolves on the same origin');
const loginIn = await get('/login', cookieHeader);
check(loginIn.status === 307, '/login bounces a signed-in user away', String(loginIn.status));
check(
  (loginIn.location || '').endsWith('/portal'),
  'and sends them to /portal, not the marketing page',
  loginIn.location || '',
);

const rootIn = await get('/', cookieHeader);
check(rootIn.status === 200, '/ still serves marketing even when signed in', String(rootIn.status));
check(/Every Case Type/.test(rootIn.body), 'and it is the landing page');

const signupIn = await get('/signup', cookieHeader);
check(signupIn.status === 307, '/signup bounces a signed-in user away', String(signupIn.status));

const missing = await get('/cases', cookieHeader);
check(missing.status === 404, 'an unbuilt app route 404s rather than erroring', String(missing.status));

console.log(
  '\n' + (failures === 0 ? 'END TO END: all checks passed' : `END TO END: ${failures} FAILED`),
);
process.exit(failures === 0 ? 0 : 1);
