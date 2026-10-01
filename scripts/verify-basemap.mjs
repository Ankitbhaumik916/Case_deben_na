/**
 * The map basemap, and the key it now needs.
 *
 *   npm run verify:basemap
 *
 * CARTO serves raster tiles with or without a key — without one they come back
 * watermarked. That makes the usual "did it 200?" check useless: a watermarked
 * tile is a successful request. What separates them is size. An unkeyed tile is
 * a couple of kilobytes of watermark; a real one is ten times that. So the test
 * fetches both and compares, rather than trusting a status code.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const ENV_FILE = arg('env') || '.env.local';

const env = {};
for (const l of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};

const KEY = env.NEXT_PUBLIC_CARTO_KEY ?? '';
const TILE = (sub, query) => `https://${sub}.basemaps.cartocdn.com/light_all/4/8/5.png${query}`;

console.log(`\nENV     ${ENV_FILE}`);
console.log(`KEY     ${KEY ? `present, ${KEY.length} chars` : 'MISSING'}`);

console.log('\nTHE KEY IS CONFIGURED BUT NOT COMMITTED');
check(KEY.length > 0, 'a CARTO key is set in the environment');

// The whole point of an env var here: the value must not be in the repo.
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
  /^\s*NEXT_PUBLIC_CARTO_KEY=\s*$/m.test(readFileSync('.env.example', 'utf8')),
  '.env.example documents the variable without a value',
);

const ignored = execSync('git check-ignore .env.local .env.hosted.local || true', {
  encoding: 'utf8',
});
check(
  ignored.includes('.env.local') && ignored.includes('.env.hosted.local'),
  'both env files carrying it are gitignored',
);

console.log('\nWHAT CARTO ACTUALLY RETURNS');
const bare = await fetch(TILE('a', ''));
const bareBytes = Buffer.from(await bare.arrayBuffer()).length;

const keyed = await fetch(TILE('a', `?key=${encodeURIComponent(KEY)}`));
const keyedBytes = Buffer.from(await keyed.arrayBuffer()).length;

check(bare.status === 200, 'an unkeyed tile still returns 200', `${bareBytes} bytes`);
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

// A bad key must not quietly fall back to the watermark without anyone noticing.
const wrong = await fetch(TILE('a', '?key=cb1_0000_0_notarealkeyatall000000000'));
const wrongBytes = Buffer.from(await wrong.arrayBuffer()).length;
check(
  wrongBytes < keyedBytes,
  'a wrong key does not get the unwatermarked tiles',
  `${wrongBytes} bytes`,
);

console.log('\nEVERY SUBDOMAIN THE MAP USES');
for (const sub of ['a', 'b', 'c']) {
  const r = await fetch(TILE(sub, `?key=${encodeURIComponent(KEY)}`));
  const bytes = Buffer.from(await r.arrayBuffer()).length;
  check(r.ok && bytes > bareBytes * 3, `${sub}.basemaps.cartocdn.com serves keyed tiles`, `${bytes} bytes`);
}

console.log('\nTHE BUILT PAGE REQUESTS KEYED TILES');
// NEXT_PUBLIC_ values are inlined at build time, so the proof is in the bundle.
// Read the directory rather than asking git: .next is gitignored, so git lists
// nothing and all three checks below would pass over an empty set.
function jsFilesIn(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...jsFilesIn(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const chunks = existsSync('.next/static/chunks') ? jsFilesIn('.next/static/chunks') : [];

let withKey = 0;
let withoutKey = 0;
for (const f of chunks) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('basemaps.cartocdn.com')) continue;
  if (KEY && src.includes(KEY)) withKey++;
  else withoutKey++;
}
check(
  chunks.length > 0,
  'the built client bundle was found',
  chunks.length ? `${chunks.length} chunks` : 'run next build first — nothing to inspect',
);

const mapChunks = chunks.filter((f) => readFileSync(f, 'utf8').includes('basemaps.cartocdn.com'));
check(mapChunks.length > 0, 'and a chunk in it references the basemap', `${mapChunks.length} chunk(s)`);
check(withKey > 0, 'a chunk builds the tile URL with the key in it', `${withKey} chunk(s)`);
check(
  withoutKey === 0,
  'and no chunk still points at cartocdn without one',
  `${withoutKey} chunk(s)`,
);

console.log('\nATTRIBUTION STAYS VISIBLE, AS CARTO REQUIRES');
const map = readFileSync('src/app/(app)/cases/CaseMap.tsx', 'utf8');
check(/carto\.com\/attributions/.test(map), 'CARTO is credited and linked');
check(/openstreetmap\.org\/copyright/.test(map), 'OpenStreetMap is credited and linked');
check(/attributionControl/.test(map), 'and the control is on the map');

console.log('\n' + (fail === 0 ? 'BASEMAP: all checks passed' : `BASEMAP: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
