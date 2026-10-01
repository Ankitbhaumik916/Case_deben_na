/**
 * The fonts, and the build-time network dependency they used to carry.
 *
 *   npm run verify:fonts
 *
 * next/font/google downloads Google's stylesheet during the build and pulls the
 * file URLs out of it with `/\.(woff|woff2|eot|ttf|otf)$/.exec(url)[1]`. When
 * Google hands back a URL that regex does not match, `.exec` returns null and
 * the build dies on `Cannot read properties of null (reading '1')` — with no
 * network error, no font name and nothing naming Google. It happened on a
 * deploy while the same build passed locally, because the response differs by
 * region.
 *
 * So the test is not "do the fonts load". It is "can this build still be broken
 * by something outside the repo", and the answer has to be no.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const BASE = arg('base') || process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100';

let fail = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};

function filesIn(dir, ext) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...filesIn(full, ext));
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

console.log(`\nTARGET  ${BASE}`);

console.log('\nTHE BUILD NO LONGER FETCHES FONTS');
const sources = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

// The import is the only thing that fetches. A mention in a comment is fine;
// an actual import is the whole failure mode coming back.
const importers = sources.filter((f) =>
  /^\s*import[^;]*from\s+['"]next\/font\/google['"]/m.test(readFileSync(f, 'utf8')),
);
check(
  importers.length === 0,
  'nothing imports next/font/google',
  importers.join(', ') || 'no importers',
);

const layout = readFileSync('src/app/layout.tsx', 'utf8');
check(/from 'next\/font\/local'/.test(layout), 'the layout uses next/font/local instead');

console.log('\nTHE FILES ARE IN THE REPO');
const tracked = execSync('git ls-files src/app/fonts', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const woff2 = tracked.filter((f) => f.endsWith('.woff2'));
check(woff2.length > 0, 'the woff2 files are tracked by git', `${woff2.length} files`);

for (const f of woff2) {
  const bytes = readFileSync(f);
  const magic = bytes.subarray(0, 4).toString('latin1');
  check(
    magic === 'wOF2' && bytes.length > 1000,
    `${f.split('/').pop()} is a real woff2`,
    `${magic}, ${bytes.length} bytes`,
  );
}

// Every path the layout names must exist, or the build fails in a way that only
// shows up on a clean checkout.
const referenced = [...layout.matchAll(/path:\s*'\.\/([^']+)'/g)].map((m) => `src/app/${m[1]}`);
check(referenced.length > 0, 'the layout names its font files', `${referenced.length} paths`);
const missing = referenced.filter((f) => !existsSync(f));
check(missing.length === 0, 'and every one of them exists', missing.join(', ') || 'all present');
const untracked = referenced.filter((f) => !tracked.includes(f.replace(/\\/g, '/')));
check(
  untracked.length === 0,
  'and every one is committed, so a fresh clone builds',
  untracked.join(', ') || 'all tracked',
);

console.log('\nREDISTRIBUTION IS LICENSED');
check(existsSync('src/app/fonts/OFL.txt'), 'the licence ships beside the fonts');
if (existsSync('src/app/fonts/OFL.txt')) {
  const ofl = readFileSync('src/app/fonts/OFL.txt', 'utf8');
  check(/SIL Open Font License/i.test(ofl), 'and is the SIL Open Font License');
  check(/IBM/i.test(ofl), 'naming the copyright holder', 'IBM Corp.');
}

console.log('\nTHE BUILD SELF-HOSTS THEM');
const emitted = filesIn('.next/static/media', '.woff2');
check(emitted.length > 0, 'woff2 files are emitted into the build', `${emitted.length} files`);
check(
  emitted.length === woff2.length,
  'one emitted file per source file, so none was dropped',
  `${woff2.length} in repo -> ${emitted.length} emitted`,
);

const css = filesIn('.next/static/css', '.css')
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
check(css.length > 0, 'the build produced stylesheets', `${css.length} bytes`);
check(
  /src:url\(\/_next\/static\/media\/[^)]+\.woff2\)/.test(css),
  'and every @font-face points at a local file',
);
check(
  !/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(css),
  'with no Google URL left in the CSS',
);

// Next's own runtime carries Google constants for the Pages Router's font
// optimisation; those are framework internals, not a fetch we cause. What must
// be clean is the code our pages actually load.
const appChunks = filesIn('.next/static/chunks/app', '.js');
const leaky = appChunks.filter((f) =>
  /fonts\.gstatic\.com|fonts\.googleapis\.com/.test(readFileSync(f, 'utf8')),
);
check(leaky.length === 0, 'no page chunk references Google', leaky.join(', ') || 'clean');

console.log('\nTHE VARIABLE FONT IS DECLARED AS ONE');
// Plex Sans became a variable font: Google serves the same file for 400, 500,
// 600 and 700. Shipping four copies of it would be 120KB of duplicate.
check(
  /weight: '400 700'/.test(layout),
  'Sans is declared over a weight range rather than four times',
);
check(
  woff2.filter((f) => /sans/i.test(f)).length === 1,
  'so there is one Sans file, not four identical ones',
  `${woff2.filter((f) => /sans/i.test(f)).length} file(s)`,
);
check(/font-weight:400 700/.test(css), 'and the CSS carries the range');

console.log('\nTHE PAGE ACTUALLY USES THEM');
const page = await fetch(`${BASE}/login`);
const html = await page.text();
check(page.status === 200, 'a page renders', String(page.status));
check(
  /class="[^"]*__variable_[^"]*"/.test(html),
  'the html element carries the generated font variables',
);
check(
  !/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(html),
  'and the page asks the browser for nothing from Google',
);

/*
 * Follow the chain the browser actually follows: page -> stylesheet ->
 * @font-face -> woff2. There is no <link rel="preload"> for these; the font is
 * discovered when the CSS is parsed, which with display:swap means text paints
 * in the fallback first and swaps. Asserting on a preload tag would have been
 * testing a link in the chain that is not there, rather than whether the font
 * arrives.
 */
const sheetHref = html.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/)?.[1];
check(Boolean(sheetHref), 'the page links a stylesheet', sheetHref ?? 'none found');

if (sheetHref) {
  const sheet = await (await fetch(BASE + sheetHref)).text();
  const fontUrl = sheet.match(/url\((\/_next\/static\/media\/[^)]+\.woff2)\)/)?.[1];
  check(Boolean(fontUrl), 'which declares a local @font-face', fontUrl ?? 'none found');

  if (fontUrl) {
    const r = await fetch(BASE + fontUrl);
    const bytes = Buffer.from(await r.arrayBuffer());
    check(
      r.ok && bytes.subarray(0, 4).toString('latin1') === 'wOF2',
      'and that font file is served from this origin',
      `${r.status}, ${bytes.length} bytes, ${r.headers.get('content-type')}`,
    );
  }
}

console.log('\n' + (fail === 0 ? 'FONTS: all checks passed' : `FONTS: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
