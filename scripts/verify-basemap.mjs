/**
 * The map basemap, and the key it needs.
 *
 *   npm run verify:basemap
 *
 * Two things are easy to get wrong here and neither shows up as an error.
 *
 * CARTO serves raster tiles with or without a key — without one they come back
 * watermarked. So "did it 200?" proves nothing: a watermarked tile is a
 * successful request. What separates them is size, and that is what gets
 * compared.
 *
 * And the key is server-only on purpose. A NEXT_PUBLIC_ name would be inlined
 * into the static bundle at build time, so rotating it would mean rebuilding
 * the client. Read by the page and handed to the map instead, it must appear in
 * the map view and nowhere else — including not in the bundle, and not on the
 * list view, which draws no map.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createServerClient } from '@supabase/ssr';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const BASE = arg('base') || process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100';
const ENV_FILE = arg('env') || '.env.local';

const env = {};
for (const l of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PW = env.SEED_DEMO_PASSWORD || 'forensibus-demo-1234';

let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};

const KEY = env.CARTO_KEY ?? '';
const TILE = (sub, query) => `https://${sub}.basemaps.cartocdn.com/light_all/4/8/5.png${query}`;

console.log(`\nTARGET  ${BASE}`);
console.log(`ENV     ${ENV_FILE}`);
console.log(`KEY     ${KEY ? `present, ${KEY.length} chars` : 'MISSING'}`);

/* ----------------------------------------------------------------- setup -- */

async function cookieFor(email) {
  const jar = new Map();
  const c = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach((x) => jar.set(x.name, x.value)),
    },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`${email}: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
}

function jsFilesIn(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...jsFilesIn(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/* -------------------------------------------------------------- the key --- */

console.log('\nTHE KEY IS CONFIGURED, AND NOT IN THE REPO');
check(KEY.length > 0, 'a CARTO key is set in the environment');
check(
  !/^NEXT_PUBLIC_/.test('CARTO_KEY') && env.NEXT_PUBLIC_CARTO_KEY === undefined,
  'under a server-only name, not NEXT_PUBLIC_',
  env.NEXT_PUBLIC_CARTO_KEY ? 'NEXT_PUBLIC_CARTO_KEY is still set — remove it' : 'CARTO_KEY',
);

const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const leaked = KEY
  ? tracked.filter((f) => {
      try {
        return readFileSync(f, 'utf8').includes(KEY);
      } catch {
        return false;
      }
    })
  : [];
check(leaked.length === 0, 'and appears in no tracked file', leaked.join(', ') || 'clean');

check(
  /^\s*CARTO_KEY=\s*$/m.test(readFileSync('.env.example', 'utf8')),
  '.env.example documents the variable without a value',
);

const ignored = execSync('git check-ignore .env.local .env.hosted.local || true', {
  encoding: 'utf8',
});
check(
  ignored.includes('.env.local') && ignored.includes('.env.hosted.local'),
  'both env files carrying it are gitignored',
);

/* ------------------------------------------------------------ what CARTO -- */

console.log('\nWHAT CARTO ACTUALLY RETURNS');
const bare = await fetch(TILE('a', ''));
const bareBytes = Buffer.from(await bare.arrayBuffer()).length;

const keyed = await fetch(TILE('a', `?key=${encodeURIComponent(KEY)}`));
const keyedBytes = Buffer.from(await keyed.arrayBuffer()).length;

check(bare.status === 200, 'an unkeyed tile still returns 200, which is why size is the test', `${bareBytes} bytes`);
check(keyed.status === 200, 'and so does a keyed one', `${keyedBytes} bytes`);
check(
  keyedBytes > bareBytes * 3,
  'the keyed tile carries far more image than the watermark tile',
  `${bareBytes} -> ${keyedBytes} bytes`,
);
check(
  (keyed.headers.get('content-type') ?? '').startsWith('image/'),
  'and is a real image',
  keyed.headers.get('content-type') ?? '?',
);

const wrong = await fetch(TILE('a', '?key=cb1_0000_0_notarealkeyatall000000000'));
const wrongBytes = Buffer.from(await wrong.arrayBuffer()).length;
check(wrongBytes < keyedBytes, 'a wrong key does not get the unwatermarked tiles', `${wrongBytes} bytes`);

console.log('\nEVERY SUBDOMAIN THE MAP USES');
for (const sub of ['a', 'b', 'c']) {
  const r = await fetch(TILE(sub, `?key=${encodeURIComponent(KEY)}`));
  const bytes = Buffer.from(await r.arrayBuffer()).length;
  check(r.ok && bytes > bareBytes * 3, `${sub}.basemaps.cartocdn.com serves keyed tiles`, `${bytes} bytes`);
}

/* ------------------------------------------------------- where it travels -- */

console.log('\nIT REACHES THE MAP, AND ONLY THE MAP');

const chunks = existsSync('.next/static/chunks') ? jsFilesIn('.next/static/chunks') : [];
check(
  chunks.length > 0,
  'the built client bundle was found',
  chunks.length ? `${chunks.length} chunks` : 'run next build first — nothing to inspect',
);
const inBundle = KEY ? chunks.filter((f) => readFileSync(f, 'utf8').includes(KEY)) : [];
check(
  inBundle.length === 0,
  'the key is NOT baked into the static bundle, so rotating it needs no rebuild',
  inBundle.length ? inBundle.join(', ') : 'absent, as intended',
);
check(
  chunks.some((f) => readFileSync(f, 'utf8').includes('basemaps.cartocdn.com')),
  'but the bundle does still know where the tiles come from',
);

const cookie = await cookieFor('ines.vargas@northgate.test');

const mapView = await fetch(`${BASE}/cases?view=map`, { headers: { cookie } });
const mapHtml = await mapView.text();
check(mapView.status === 200, 'the map view renders', String(mapView.status));
check(KEY.length > 0 && mapHtml.includes(KEY), 'and carries the key to the browser');

// Only the view that draws a map should pay for it.
const listView = await fetch(`${BASE}/cases`, { headers: { cookie } });
const listHtml = await listView.text();
check(
  !(KEY.length > 0 && listHtml.includes(KEY)),
  'the list view does not, because it draws no map',
);

// Signed out, nothing should hand it over at all.
const anon = await fetch(`${BASE}/cases?view=map`, { redirect: 'manual' });
const anonBody = anon.status < 300 ? await anon.text() : '';
check(
  !anonBody.includes(KEY),
  'and a signed-out request gets neither the map nor the key',
  `status ${anon.status}`,
);

/* ------------------------------------------------------------ attribution -- */

console.log('\nATTRIBUTION STAYS VISIBLE, AS CARTO REQUIRES');
const map = readFileSync('src/app/(app)/cases/CaseMap.tsx', 'utf8');
check(/carto\.com\/attributions/.test(map), 'CARTO is credited and linked');
check(/openstreetmap\.org\/copyright/.test(map), 'OpenStreetMap is credited and linked');
check(/attributionControl/.test(map), 'and the control is on the map');
check(
  !/process\.env\.NEXT_PUBLIC_CARTO_KEY/.test(map),
  'the map reads the key from its prop, not from a public env var',
);

console.log('\n' + (fail === 0 ? 'BASEMAP: all checks passed' : `BASEMAP: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
