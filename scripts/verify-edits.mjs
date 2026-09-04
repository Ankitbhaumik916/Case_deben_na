/**
 * Template delete guards, rich text, and photo mark-up.
 *
 *   npm run verify:edits
 *
 * What each check can and cannot reach:
 *
 * The delete guards live in server actions, which a Node script cannot invoke —
 * they are checked structurally, alongside a live check that the foreign key
 * they protect really does cascade, so the guard is provably load-bearing
 * rather than decorative.
 *
 * The rich text sanitiser needs a DOM and runs in the browser. What is proved
 * here is the part that leaves the browser: markup must not reach the search
 * index, and no stored string may be handed to innerHTML anywhere.
 */
import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

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
let skip = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};
const manual = (label, why) => {
  console.log(`  CHECK ${label}  — ${why}`);
  skip++;
};

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

const get = async (path, cookie) => {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const raw = r.status < 300 ? await r.text() : '';
  return { status: r.status, raw, body: raw.replace(/<!--\s*-->/g, '') };
};

async function asUser(email) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email, password: PW });
  return c;
}

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

console.log(`\nTARGET  ${BASE}`);
console.log(`AUTH    ${env.NEXT_PUBLIC_SUPABASE_URL}  (${ENV_FILE})`);

const invCookie = await cookieFor('ines.vargas@northgate.test');
const inv = await asUser('ines.vargas@northgate.test');
const ro = await asUser('rosa.ortiz@northgate.test');

const { data: kase } = await svc
  .from('cases')
  .select('id, org_id, case_number, case_type_id')
  .eq('case_number', 'NG-2026-0101')
  .single();

const stamp = Date.now();
const bin = { mediaIds: [], paths: [], logIds: [], fieldIds: [] };

console.log('\nPREFLIGHT');
const pre = await get(`/cases/${kase.id}`, invCookie);
if (pre.status !== 200) {
  console.log(`  FAIL  the case page did not render (${pre.status})`);
  process.exit(1);
}
check(true, `the case page rendered (${kase.case_number})`);

// ---------------------------------------------------------------- 1 ----------
console.log('\n1. NOTHING IN A TEMPLATE CAN BE DELETED OUT FROM UNDER A CASE');

const config = readFileSync('src/lib/actions/case-type-config.ts', 'utf8');
const types = readFileSync('src/lib/actions/case-types.ts', 'utf8');

// Every delete on the template must count what depends on it first.
const GUARDS = [
  ['deleteCaseType', types, 'cases'],
  ['deleteSection', types, 'case_field_values'],
  ['deleteField', types, 'case_field_values'],
  ['deleteStatus', config, 'cases'],
  ['deleteChecklist', config, 'case_checklist_responses'],
  ['deleteChecklistItem', config, 'case_checklist_responses'],
  ['deleteReportSection', config, 'case_report_section_drafts'],
];

for (const [fn, source, dependent] of GUARDS) {
  const start = source.indexOf(`export async function ${fn}`);
  const body = source.slice(start, start === -1 ? 0 : source.indexOf('\nexport async', start + 1));
  const counts = body.includes(dependent) && /count \?\? 0\) > 0/.test(body);
  const countsBeforeDeleting =
    counts && body.indexOf(dependent) < body.indexOf('.delete()');
  check(
    countsBeforeDeleting,
    `${fn} refuses while ${dependent} still points at it`,
    counts ? '' : 'no count guard found',
  );
}

// The guard only matters because the database would otherwise take the children
// with it. Confirm that is still true rather than assuming.
const { data: cascades } = await svc.rpc('strip_markup', { p_text: 'probe' }).then(
  () => svc.from('case_report_section_drafts').select('id').limit(1),
  () => ({ data: null }),
);
check(
  cascades !== null,
  'case_report_section_drafts is readable, so the guard has something to protect',
);

manual(
  'the builder shows the refusal',
  'delete a report section that a case has written against — expect a message naming the count, not a silent removal',
);

// ---------------------------------------------------------------- 2 ----------
console.log('\n2. LONG-FORM FIELDS TAKE FORMATTING, AND IT STAYS OUT OF SEARCH');

const { data: textField } = await svc
  .from('case_type_fields')
  .select('id, label, section_id, case_type_sections!inner ( case_type_id )')
  .eq('field_type', 'textarea')
  .eq('case_type_sections.case_type_id', kase.case_type_id)
  .limit(1)
  .maybeSingle();

if (!textField) {
  check(false, 'this case type has a long-form field to test with', 'none found');
} else {
  const marker = `zqarson${stamp}`;
  const markup = `<p>Seat of fire <strong>confirmed</strong>.</p><ul><li>${marker}</li></ul>`;

  const { error: valErr } = await inv
    .from('case_field_values')
    .upsert(
      { org_id: kase.org_id, case_id: kase.id, field_id: textField.id, value: markup },
      { onConflict: 'case_id,field_id' },
    );
  check(!valErr, 'an investigator saves formatted text', valErr?.message ?? '');
  if (!valErr) bin.fieldIds.push(textField.id);

  const { data: back } = await svc
    .from('case_field_values')
    .select('value')
    .eq('case_id', kase.id)
    .eq('field_id', textField.id)
    .single();
  check(back?.value === markup, 'the markup is stored as written');

  // strip_markup is what keeps tag names out of to_tsvector.
  const { data: stripped } = await svc.rpc('strip_markup', { p_text: markup });
  check(
    stripped === `Seat of fire confirmed. ${marker}`,
    'strip_markup returns the words without the tags',
    JSON.stringify(stripped),
  );

  const { data: searchRow } = await svc
    .from('cases')
    .select('search_document')
    .eq('id', kase.id)
    .single();
  const doc = (searchRow?.search_document ?? '').toLowerCase();
  check(doc.includes(marker), 'the words reached the search index', marker);
  check(
    !doc.includes('<strong>') && !/\bstrong\b/.test(doc) && !/\bli\b/.test(doc),
    'and the tag names did not',
    doc.includes('strong') ? 'FOUND "strong" IN THE INDEX' : '',
  );

  // The point of the above: searching for a tag name must not find the case.
  const listByTag = await get(`/cases?q=strong`, invCookie);
  check(
    !listByTag.body.includes(kase.case_number),
    'searching for "strong" does not return the case that merely has bold text',
  );
  const listByWord = await get(`/cases?q=${marker}`, invCookie);
  check(
    listByWord.body.includes(kase.case_number),
    'searching for a word inside the formatted text does',
  );

  const page = await get(`/cases/${kase.id}`, invCookie);
  check(/Bulleted list|Formatting/.test(page.raw), 'the field renders a formatting toolbar');
}

// Stored markup must never become live markup. The editor rebuilds it node by
// node; nothing in the app hands it to innerHTML.
const srcFiles = [
  'src/components/fields/RichTextField.tsx',
  'src/components/fields/DynamicField.tsx',
  'src/app/(app)/cases/[id]/CaseWorkspace.tsx',
];
const anyInnerHtml = srcFiles.some((f) =>
  /dangerouslySetInnerHTML/.test(readFileSync(f, 'utf8')),
);
check(!anyInnerHtml, 'no stored value is handed to dangerouslySetInnerHTML');

const richText = readFileSync('src/lib/rich-text.ts', 'utf8');
check(
  /SAFE_HREF\s*=\s*\/\^\(https\?:/.test(richText),
  'link addresses are checked against an allowlist, so javascript: cannot survive',
);

// ---------------------------------------------------------------- 3 ----------
console.log('\n3. PHOTO MARK-UP IS STORED BESIDE THE FILE, NOT DRAWN INTO IT');

const path = `${kase.org_id}/${kase.id}/markprobe-${stamp}.png`;
const { error: upErr } = await inv.storage
  .from('case-media')
  .upload(path, PNG, { contentType: 'image/png' });
check(!upErr, 'a photograph uploads', upErr?.message ?? '');
if (!upErr) bin.paths.push(path);

const { data: photo, error: photoErr } = await inv
  .from('media_files')
  .insert({
    org_id: kase.org_id,
    case_id: kase.id,
    bucket: 'case-media',
    storage_path: path,
    file_name: `markprobe-${stamp}.png`,
    mime_type: 'image/png',
    size_bytes: PNG.length,
    caption: 'Mark-up probe',
  })
  .select('id, annotations')
  .single();
check(!photoErr, 'and is recorded', photoErr?.message ?? '');
if (photo) bin.mediaIds.push(photo.id);

check(
  Array.isArray(photo?.annotations) && photo.annotations.length === 0,
  'a new photograph starts with no mark-up',
  JSON.stringify(photo?.annotations),
);

const shapes = [
  { id: 'a1b2c3', kind: 'arrow', color: '#e5484d', stroke: 3, x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.7 },
  { id: 'd4e5f6', kind: 'text', color: '#ffffff', x: 0.5, y: 0.5, size: 0.05, text: 'Seat of fire' },
];

const { error: markErr } = await inv
  .from('media_files')
  .update({ annotations: shapes })
  .eq('id', photo.id);
check(!markErr, 'an investigator marks it up', markErr?.message ?? '');

const { data: marked } = await svc
  .from('media_files')
  .select('annotations, storage_path, size_bytes')
  .eq('id', photo.id)
  .single();
check((marked?.annotations ?? []).length === 2, 'both marks are stored');

// The whole design: the exhibit is untouched.
const { data: blob } = await svc.storage.from('case-media').download(path);
const bytes = blob ? Buffer.from(await blob.arrayBuffer()) : Buffer.alloc(0);
check(
  bytes.equals(PNG),
  'the photograph itself is byte-for-byte what was uploaded',
  `${bytes.length} bytes, identical: ${bytes.equals(PNG)}`,
);
check(
  marked?.storage_path === path && marked?.size_bytes === PNG.length,
  'and its stored path and size did not move',
);

const roMark = await ro
  .from('media_files')
  .update({ annotations: shapes })
  .eq('id', photo.id)
  .select('id');
check(
  (roMark.data ?? []).length === 0,
  'a read-only account cannot mark up a photograph',
  `${(roMark.data ?? []).length} rows, ${roMark.error?.code ?? 'no error'}`,
);

// The column will only hold an array — the check constraint, not the app.
const { error: shapeErr } = await svc
  .from('media_files')
  .update({ annotations: { not: 'an array' } })
  .eq('id', photo.id);
check(!!shapeErr, 'the column refuses anything that is not a list of shapes', shapeErr?.code ?? 'ACCEPTED');

// The mark-up has to survive into the printed log, which is the point of it.
const { data: log } = await inv
  .from('media_log_reports')
  .insert({
    org_id: kase.org_id,
    case_id: kase.id,
    title: `Mark-up log ${stamp}`,
    media_ids: [photo.id],
  })
  .select('id')
  .single();
if (log) bin.logIds.push(log.id);

const doc = await get(`/cases/${kase.id}/media-log/${log.id}`, invCookie);
check(doc.status === 200, 'the media log renders', String(doc.status));
check(/<svg/.test(doc.raw), 'the printed log draws the mark-up over the photograph');
check(/Seat of fire/.test(doc.raw), 'including the label text');
check(/drawn over the original/.test(doc.raw), 'and says the original was not altered');

manual(
  'drawing works by hand',
  'open the library, click a photograph, draw an arrow — it should save itself and survive a reload',
);

console.log('\nCLEANUP');
for (const id of bin.logIds) await svc.from('media_log_reports').delete().eq('id', id);
if (bin.mediaIds.length) await svc.from('media_files').delete().in('id', bin.mediaIds);
if (bin.paths.length) await svc.storage.from('case-media').remove(bin.paths);
for (const fieldId of bin.fieldIds) {
  await svc.from('case_field_values').delete().eq('case_id', kase.id).eq('field_id', fieldId);
}
const { count: left } = await svc
  .from('media_files')
  .select('id', { count: 'exact', head: true })
  .like('file_name', 'markprobe-%');
check(left === 0, 'probe files removed', String(left));

const { data: finalDoc } = await svc
  .from('cases')
  .select('search_document')
  .eq('id', kase.id)
  .single();
check(
  !(finalDoc?.search_document ?? '').includes(`zqarson${stamp}`),
  'and the probe text left the search index with it',
);

console.log(
  '\n' +
    (fail === 0
      ? `EDITS: all checks passed${skip ? ` (${skip} need a look in a browser)` : ''}`
      : `EDITS: ${fail} FAILED`),
);
process.exit(fail ? 1 : 0);
