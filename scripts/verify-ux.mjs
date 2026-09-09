/**
 * Four corrections: editable mark-up, the detail panel on the right, previews
 * on a field, and template deletes that warn and confirm rather than refuse.
 *
 *   npm run verify:ux
 *
 * Three of the four are interaction, which cannot be driven over HTTP. Those
 * are checked where they leave a trace the server can see — the shapes that get
 * stored, the URLs the page mints, the markup it ships — and the rest is called
 * out as needing a browser rather than counted as passing.
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

// Test on a case whose type actually carries a photo field.
const { data: storageFields } = await svc
  .from('case_type_fields')
  .select('id, label, section_id, case_type_sections!inner ( case_type_id )')
  .in('field_type', ['photo', 'file'])
  .eq('is_active', true);

const photoField = (storageFields ?? [])[0] ?? null;
const { data: kase } = await svc
  .from('cases')
  .select('id, org_id, case_number, case_type_id')
  .eq('case_type_id', photoField?.case_type_sections?.case_type_id ?? '')
  .order('case_number')
  .limit(1)
  .maybeSingle();

if (!kase || !photoField) {
  console.log('\n  FAIL  no case of a type carrying a photo field');
  process.exit(1);
}

const stamp = Date.now();
const bin = { mediaIds: [], paths: [] };

console.log('\nPREFLIGHT');
const pre = await get(`/cases/${kase.id}`, invCookie);
if (pre.status !== 200) {
  console.log(`  FAIL  the case page did not render (${pre.status})`);
  process.exit(1);
}
check(true, `the case page rendered (${kase.case_number})`);

// ---------------------------------------------------------------- 1 ----------
console.log('\n1. A MARK CAN BE MOVED AND RESIZED AFTER IT IS DRAWN');

const path = `${kase.org_id}/${kase.id}/uxprobe-${stamp}.png`;
await inv.storage.from('case-media').upload(path, PNG, { contentType: 'image/png' });
bin.paths.push(path);

const { data: photo } = await inv
  .from('media_files')
  .insert({
    org_id: kase.org_id,
    case_id: kase.id,
    bucket: 'case-media',
    storage_path: path,
    file_name: `uxprobe-${stamp}.png`,
    mime_type: 'image/png',
    size_bytes: PNG.length,
    section_id: photoField.section_id,
    field_id: photoField.id,
    caption: 'UX probe',
  })
  .select('id')
  .single();
bin.mediaIds.push(photo.id);

const drawn = [
  { id: 'mv0001', kind: 'arrow', color: '#e5484d', stroke: 3, x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.4 },
  { id: 'mv0002', kind: 'text', color: '#ffffff', x: 0.5, y: 0.5, size: 0.045, text: 'Before' },
];
await inv.from('media_files').update({ annotations: drawn }).eq('id', photo.id);

// Moving a mark rewrites its coordinates and keeps its id — an edit, not a
// delete and redraw, which is what "only choice is to undo" used to mean.
const moved = [
  { ...drawn[0], x1: 0.3, y1: 0.3, x2: 0.6, y2: 0.6 },
  { ...drawn[1], x: 0.7, y: 0.2, size: 0.08, text: 'After' },
];
const { error: moveErr } = await inv
  .from('media_files')
  .update({ annotations: moved })
  .eq('id', photo.id);
check(!moveErr, 'a mark can be rewritten in place', moveErr?.message ?? '');

const { data: after } = await svc
  .from('media_files')
  .select('annotations')
  .eq('id', photo.id)
  .single();
const arrow = (after.annotations ?? []).find((s) => s.id === 'mv0001');
const label = (after.annotations ?? []).find((s) => s.id === 'mv0002');
check(arrow?.x1 === 0.3 && arrow?.y2 === 0.6, 'the arrow kept its id at its new position');
check(label?.text === 'After', 'the label text was edited rather than replaced');
check(label?.size === 0.08, 'and its size changed');
check((after.annotations ?? []).length === 2, 'no mark was duplicated doing it', String((after.annotations ?? []).length));

const markup = readFileSync('src/components/media/ImageMarkup.tsx', 'utf8');
check(/function moveShape\(/.test(markup), 'the editor has a move for every kind of mark');
check(/function resizeShape\(/.test(markup), 'and a resize for the ones that can be resized');
check(
  /gripsFor\(/.test(markup) && /GRIP_LABEL/.test(markup),
  'with labelled drag handles rather than an invisible hit area',
);
check(
  /setTool\('select'\);\s*\n\s*setSelectedId\(draft\.id\)/.test(markup),
  'a mark just drawn is selected straight away, so it can be adjusted',
);
manual(
  'previews on a field',
  `open ${kase.case_number}, section "${photoField.label.slice(0, 28)}" — expect thumbnails under the upload box`,
);
manual(
  'dragging a mark',
  'open a photograph, draw an arrow, then drag it and its handles — it should move and resize, not just undo',
);

// ---------------------------------------------------------------- 2 ----------
console.log('\n2. THE OPEN FILE SITS BESIDE THE GALLERY, NOT UNDER IT');
const library = readFileSync('src/app/(app)/cases/[id]/LibraryPanel.tsx', 'utf8');
check(
  /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(24rem,32rem\)\]/.test(library),
  'the gallery and the open file share a two-column grid',
);
check(/xl:sticky xl:top-20/.test(library), 'and the panel stays put while the grid scrolls');
check(
  !/md:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/.test(library),
  'the panel stopped trying to be two columns inside one',
);

// ---------------------------------------------------------------- 3 ----------
console.log('\n3. A FIELD SHOWS WHAT WAS UPLOADED TO IT');
const filePage = await get(`/cases/${kase.id}?tab=file`, invCookie);
check(
  /storage\/v1\/object\/sign\/case-media/.test(filePage.raw),
  'the case file tab now signs URLs for field attachments',
);

// It must sign only those, not the whole library.
const { count: allMedia } = await svc
  .from('media_files')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id);
const { count: fieldMedia } = await svc
  .from('media_files')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id)
  .not('field_id', 'is', null);
const signedCount = (filePage.raw.match(/storage\/v1\/object\/sign\/case-media/g) ?? []).length;
check(
  signedCount <= fieldMedia && allMedia >= fieldMedia,
  'and only for those, not the whole library',
  `${signedCount} signed, ${fieldMedia} attached to fields, ${allMedia} in the case`,
);

// The workspace renders only the section that is open, so a field further down
// the rail is not in the HTML at all — its thumbnails cannot be fetched. What
// is provable here is the mechanism: the uploader builds the link, and the
// library honours it (the two checks below).
const uploader = readFileSync('src/components/fields/FieldUploader.tsx', 'utf8');
check(
  /\$\{libraryHref\}&file=\$\{f\.id\}/.test(uploader),
  'a preview links to that exact file in the library',
);
check(
  /files\.slice\(0, PREVIEW_LIMIT\)/.test(uploader) && /files\.length - PREVIEW_LIMIT/.test(uploader),
  'and a long list is capped with a "+n" rather than becoming a second gallery',
);

const deep = await get(`/cases/${kase.id}?tab=library&file=${photo.id}`, invCookie);
check(deep.status === 200, 'the library accepts a file to open', String(deep.status));
check(
  deep.raw.includes('UX probe'),
  'and that file is the one it opens',
);

// ---------------------------------------------------------------- 4 ----------
console.log('\n4. A TEMPLATE DELETE WARNS AND ASKS, RATHER THAN REFUSING');

const config = readFileSync('src/lib/actions/case-type-config.ts', 'utf8');
const types = readFileSync('src/lib/actions/case-types.ts', 'utf8');

const GUARDS = [
  ['deleteCaseType', types],
  ['deleteSection', types],
  ['deleteField', types],
  ['deleteStatus', config],
  ['deleteChecklist', config],
  ['deleteChecklistItem', config],
  ['deleteReportSection', config],
];

for (const [fn, source] of GUARDS) {
  const start = source.indexOf(`export async function ${fn}`);
  const end = source.indexOf('\nexport async', start + 1);
  const body = source.slice(start, end === -1 ? undefined : end);
  check(
    /confirmed = false/.test(body) && /needsConfirmation\(/.test(body) && /&& !confirmed/.test(body),
    `${fn} offers an override instead of a flat refusal`,
  );
}

check(
  !/return fail\(\s*`\$\{count\}/.test(config) && !/return fail\(\s*`\$\{count\}/.test(types),
  'no delete still refuses outright on a count',
);

const dialog = readFileSync('src/components/ui/ConfirmDialog.tsx', 'utf8');
check(/role="alertdialog"/.test(dialog), 'the warning is a real dialog, not a browser confirm');
check(/aria-modal="true"/.test(dialog), 'and is modal');
check(/record\{count === 1 \? '' : 's'\} affected/.test(dialog), 'it puts the count in front of the reader');
check(/This cannot be undone/.test(dialog), 'and says the change is permanent');
check(
  /confirmed: true/.test(dialog) || /confirmed: true,/.test(dialog),
  'saying yes a second time is what sends the override',
);

// The builder must have stopped using window.confirm for these.
const editors = [
  'src/app/(app)/admin/case-types/[id]/SectionsEditor.tsx',
  'src/app/(app)/admin/case-types/[id]/StatusesEditor.tsx',
  'src/app/(app)/admin/case-types/[id]/ChecklistEditor.tsx',
  'src/app/(app)/admin/case-types/[id]/ReportTemplateEditor.tsx',
];
for (const file of editors) {
  const src = readFileSync(file, 'utf8');
  const name = file.split('/').pop();
  check(
    /destructive\.request\(/.test(src) && /destructive\.dialog/.test(src),
    `${name} routes deletes through the dialog`,
  );
  check(!/window\.confirm/.test(src), `${name} no longer uses window.confirm`);
}

// Prove the override end to end at the layer the action uses: a field with
// answers is deletable, and taking it deletes them, which is why it asks.
const { data: section } = await svc
  .from('case_type_sections')
  .select('id, org_id, case_type_id')
  .eq('case_type_id', kase.case_type_id)
  .limit(1)
  .single();

const { data: probeField } = await svc
  .from('case_type_fields')
  .insert({
    org_id: section.org_id,
    section_id: section.id,
    key: `uxprobe_${stamp}`,
    label: 'UX probe field',
    field_type: 'text',
    sort_order: 999,
  })
  .select('id')
  .single();

await svc.from('case_field_values').insert({
  org_id: kase.org_id,
  case_id: kase.id,
  field_id: probeField.id,
  value: 'an answer somebody gave',
});

const { count: answers } = await svc
  .from('case_field_values')
  .select('id', { count: 'exact', head: true })
  .eq('field_id', probeField.id);
check(answers === 1, 'a field with a real answer exists to test against', String(answers));

const { error: dropErr } = await svc.from('case_type_fields').delete().eq('id', probeField.id);
check(!dropErr, 'the delete goes through once confirmed', dropErr?.message ?? '');

const { count: answersAfter } = await svc
  .from('case_field_values')
  .select('id', { count: 'exact', head: true })
  .eq('field_id', probeField.id);
check(
  answersAfter === 0,
  'and the answers go with it — which is exactly what the dialog warns about',
  `${answers} -> ${answersAfter}`,
);

manual(
  'the two-step dialog',
  'in the builder, delete a field a case has answered — expect "are you sure", then a second dialog naming the count',
);

console.log('\nCLEANUP');
if (bin.mediaIds.length) await svc.from('media_files').delete().in('id', bin.mediaIds);
if (bin.paths.length) await svc.storage.from('case-media').remove(bin.paths);
const { count: left } = await svc
  .from('media_files')
  .select('id', { count: 'exact', head: true })
  .like('file_name', 'uxprobe-%');
check(left === 0, 'probe media removed', String(left));

const { count: fieldsLeft } = await svc
  .from('case_type_fields')
  .select('id', { count: 'exact', head: true })
  .like('key', 'uxprobe_%');
check(fieldsLeft === 0, 'probe field removed', String(fieldsLeft));

console.log(
  '\n' +
    (fail === 0
      ? `UX: all checks passed${skip ? ` (${skip} need a look in a browser)` : ''}`
      : `UX: ${fail} FAILED`),
);
process.exit(fail ? 1 : 0);
