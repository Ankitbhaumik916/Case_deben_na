/**
 * The five changes asked for before phase 9.
 *
 *   npm run verify:fixes
 *
 * One of them — staying in the section you are editing — is client state and
 * cannot be proved over HTTP. It is checked structurally here and called out as
 * needing a look in a browser, rather than quietly counted as passing.
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
  return {
    status: r.status,
    body: raw
      .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, '')
      .replace(/<!--\s*-->/g, ''),
  };
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
const roCookie = await cookieFor('rosa.ortiz@northgate.test');
const inv = await asUser('ines.vargas@northgate.test');
const ro = await asUser('rosa.ortiz@northgate.test');

/*
 * Fields hang off a section, and the section off the case type — there is no
 * case_type_id on case_type_fields. Getting that wrong returned an error this
 * suite did not check and silently reported "no photo field exists" against a
 * database that has seven. Resolve the chain properly, and test whichever case
 * actually has one rather than assuming a case number.
 */
const { data: storageFields, error: storageFieldsError } = await svc
  .from('case_type_fields')
  .select('id, label, field_type, section_id, case_type_sections!inner ( case_type_id )')
  .in('field_type', ['photo', 'file'])
  .eq('is_active', true);

if (storageFieldsError) {
  console.log(`\n  FAIL  could not read the field list — ${storageFieldsError.message}`);
  process.exit(1);
}

const photoField = (storageFields ?? [])[0] ?? null;
const photoTypeId = photoField?.case_type_sections?.case_type_id ?? null;

const { data: kase } = await svc
  .from('cases')
  .select('id, org_id, case_number, title, case_type_id')
  .eq('case_type_id', photoTypeId ?? '00000000-0000-0000-0000-000000000000')
  .order('case_number')
  .limit(1)
  .maybeSingle();

if (!kase) {
  console.log('\n  FAIL  no case exists of a type carrying a photo or file field');
  process.exit(1);
}

/*
 * How a denial actually looks, and why "no error" proves nothing.
 *
 * An INSERT blocked by a WITH CHECK clause raises 42501 — a real error. An
 * UPDATE or DELETE blocked by a USING clause does not: the row is filtered out
 * before the statement sees it, so PostgREST reports success over zero rows.
 * Asserting on `error` alone therefore reads a correct refusal as a leak, which
 * is exactly what the first run of this suite did. Ask for the affected rows
 * back, and confirm the value on disk is untouched.
 */
async function writeIsRefused(client, table, id, patch, column) {
  const before = await svc.from(table).select(column).eq('id', id).single();
  const attempt = await client.from(table).update(patch).eq('id', id).select('id');
  const after = await svc.from(table).select(column).eq('id', id).single();
  return {
    refused: (attempt.data ?? []).length === 0 && after.data[column] === before.data[column],
    rows: (attempt.data ?? []).length,
    code: attempt.error?.code ?? 'no error',
  };
}

async function deleteIsRefused(client, table, id) {
  const attempt = await client.from(table).delete().eq('id', id).select('id');
  const { count } = await svc.from(table).select('id', { count: 'exact', head: true }).eq('id', id);
  return {
    refused: (attempt.data ?? []).length === 0 && count === 1,
    rows: (attempt.data ?? []).length,
    code: attempt.error?.code ?? 'no error',
  };
}

const stamp = Date.now();
const cleanup = { mediaIds: [], paths: [], responseItemIds: [] };

console.log('\nPREFLIGHT');
const pre = await get(`/cases/${kase.id}`, invCookie);
if (pre.status !== 200) {
  console.log(`  FAIL  the case page did not render (${pre.status})`);
  process.exit(1);
}
check(true, `the case page rendered (${kase.case_number})`);

// ---------------------------------------------------------------- 1 ----------
console.log('\n1. SAVING NO LONGER THROWS YOU BACK TO THE FIRST SECTION');
const workspace = readFileSync('src/app/(app)/cases/[id]/CaseWorkspace.tsx', 'utf8');
check(
  /setActiveSectionId\(\(current\) => \{/.test(workspace),
  'the reset became a functional update that keeps a valid selection',
);
check(
  !/const first = sections\.find\(\(s\) => s\.tabKey === tab\);\s*setActiveSectionId\(first/.test(
    workspace,
  ),
  'the unconditional reset is gone',
);
check(
  /revalidatePath\(`\/cases\/\$\{input\.caseId\}`\)/.test(
    readFileSync('src/lib/actions/case-values.ts', 'utf8'),
  ),
  'the cause is still present, so the guard is load-bearing',
  'saveFieldValue revalidates on every commit',
);
manual(
  'the section stays open while typing',
  'client state — open a case, edit a field in a later section, confirm it does not jump',
);

// ---------------------------------------------------------------- 2 ----------
console.log('\n2. AN UPLOADED PHOTOGRAPH COUNTS TOWARDS ITS SECTION');
if (!photoField) {
  check(false, 'this case type has a photo or file field to test with', 'none found');
} else {
  const sectionFieldCount = (
    await svc
      .from('case_type_fields')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', photoField.section_id)
      .eq('is_active', true)
  ).count;

  const before = await get(`/cases/${kase.id}`, invCookie);
  const railBefore = before.body.match(/>(\d+)\/(\d+)</g) ?? [];
  check(true, `found "${photoField.label}" (${photoField.field_type})`, `section has ${sectionFieldCount} fields`);

  const path = `${kase.org_id}/${kase.id}/fixprobe-${stamp}.png`;
  const { error: upErr } = await inv.storage
    .from('case-media')
    .upload(path, PNG, { contentType: 'image/png' });
  check(!upErr, 'an investigator uploads a photograph', upErr?.message ?? '');
  if (!upErr) cleanup.paths.push(path);

  const { data: row, error: rowErr } = await inv
    .from('media_files')
    .insert({
      org_id: kase.org_id,
      case_id: kase.id,
      bucket: 'case-media',
      storage_path: path,
      file_name: `fixprobe-${stamp}.png`,
      mime_type: 'image/png',
      size_bytes: PNG.length,
      section_id: photoField.section_id,
      field_id: photoField.id,
    })
    .select('id, field_id, section_id')
    .single();
  check(!rowErr, 'and it records which field it answers', rowErr?.message ?? '');
  if (row) cleanup.mediaIds.push(row.id);
  check(row?.field_id === photoField.id, 'the field id survived the insert', row?.field_id ?? 'none');

  const after = await get(`/cases/${kase.id}`, invCookie);
  const railAfter = after.body.match(/>(\d+)\/(\d+)</g) ?? [];
  check(
    JSON.stringify(railBefore) !== JSON.stringify(railAfter),
    'the section counters on the page changed after the upload',
    `${railBefore.join(' ')}  ->  ${railAfter.join(' ')}`,
  );
  check(
    !/arrive with the media library/.test(after.body),
    'the old "uploads arrive later" placeholder is gone from the app',
  );
  // The workspace only renders the section that is open, and there is no way to
  // deep-link one, so a section further down the rail cannot be fetched over
  // HTTP. The counter moving above is the real proof the data path works; what
  // the control looks like is a structural check plus a look in a browser.
  const dynamicField = readFileSync('src/components/fields/DynamicField.tsx', 'utf8');
  check(
    /case 'photo':[\s\S]{0,900}<FieldUploader/.test(dynamicField),
    'a photo field is wired to the uploader rather than a placeholder',
  );
  const uploader = readFileSync('src/components/fields/FieldUploader.tsx', 'utf8');
  check(
    /fieldId,\s*$/m.test(uploader) || /fieldId,/.test(uploader),
    'and the uploader sends the field id with the file',
  );
  manual(
    'the attachment control looks right',
    `open ${kase.case_number}, section "${photoField.label.slice(0, 30)}" — expect an upload box, not a grey note`,
  );
}

// ---------------------------------------------------------------- 3 ----------
console.log('\n3. THE COMPLIANCE CHECKLIST REACHES INVESTIGATORS');
const compliance = await get(`/cases/${kase.id}?tab=compliance`, invCookie);
check(compliance.status === 200, 'the compliance tab renders', String(compliance.status));
check(/Compliance/.test(compliance.body), 'and is headed as such');

const { data: item } = await svc
  .from('checklist_items')
  .select('id, label, checklist_id')
  .limit(1)
  .maybeSingle();

if (!item) {
  check(false, 'there is a checklist item to tick', 'none seeded');
} else {
  check(
    compliance.body.includes(item.label),
    'a real check from the case type appears on the page',
    item.label.slice(0, 40),
  );

  const { error: tickErr } = await inv.from('case_checklist_responses').upsert(
    {
      org_id: kase.org_id,
      case_id: kase.id,
      item_id: item.id,
      is_checked: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'case_id,item_id' },
  );
  check(!tickErr, 'an investigator can tick it', tickErr?.code ?? '');
  if (!tickErr) cleanup.responseItemIds.push(item.id);

  const { error: roTickErr } = await ro.from('case_checklist_responses').upsert(
    { org_id: kase.org_id, case_id: kase.id, item_id: item.id, is_checked: true },
    { onConflict: 'case_id,item_id' },
  );
  check(!!roTickErr, 'a read-only account cannot', roTickErr?.code ?? 'NO ERROR');

  // The point of the request: answer the checklist, never edit it.
  const rename = await writeIsRefused(
    inv,
    'checklist_items',
    item.id,
    { label: 'Renamed by an investigator' },
    'label',
  );
  check(rename.refused, 'an investigator cannot rename a check', `${rename.rows} rows, ${rename.code}`);

  const removal = await deleteIsRefused(inv, 'checklist_items', item.id);
  check(removal.refused, 'nor delete one', `${removal.rows} rows, ${removal.code}`);

  const { count: stillThere } = await svc
    .from('checklist_items')
    .select('id', { count: 'exact', head: true })
    .eq('id', item.id);
  check(stillThere === 1, 'and the check is still there afterwards', String(stillThere));
}

const roCompliance = await get(`/cases/${kase.id}?tab=compliance`, roCookie);
check(
  /Read-only/.test(roCompliance.body),
  'a read-only account is told the checklist cannot be ticked',
);

// ---------------------------------------------------------------- 4 ----------
console.log('\n4. CASE DETAILS ARE EDITABLE');
const filePage = await get(`/cases/${kase.id}`, invCookie);
check(/Edit case details/.test(filePage.body), 'an investigator is offered the editor');
const roFilePage = await get(`/cases/${kase.id}`, roCookie);
check(
  !/Edit case details/.test(roFilePage.body),
  'a read-only account is not',
);

const originalTitle = kase.title;
const { error: editCaseErr } = await inv
  .from('cases')
  .update({ title: `Probe title ${stamp}` })
  .eq('id', kase.id);
check(!editCaseErr, 'and the database lets them write it', editCaseErr?.code ?? '');

const edited = await get(`/cases/${kase.id}`, invCookie);
check(
  edited.body.includes(`Probe title ${stamp}`),
  'the new description shows on the case immediately',
);

const roEdit = await writeIsRefused(ro, 'cases', kase.id, { title: 'nope' }, 'title');
check(roEdit.refused, 'a read-only account is refused', `${roEdit.rows} rows, ${roEdit.code}`);

await svc.from('cases').update({ title: originalTitle }).eq('id', kase.id);
const { data: restored } = await svc.from('cases').select('title').eq('id', kase.id).single();
check(restored.title === originalTitle, 'title restored', restored.title ?? 'null');

// ---------------------------------------------------------------- 5 ----------
console.log('\n5. THE SIGN-IN PANEL PLAYS THE BACKGROUND CLIP');
for (const route of ['/login', '/signup']) {
  const page = await get(route, null);
  check(page.status === 200, `${route} renders`, String(page.status));
  check(/<video/.test(page.body), `${route} has a video element`);
  check(
    /d8j0ntlcm91z4\.cloudfront\.net/.test(page.body),
    `${route} points at the supplied clip`,
  );
  check(
    /d2ol7oe51mr4n9\.cloudfront\.net/.test(page.body),
    `${route} carries the poster still as well`,
  );
  check(/autoPlay|autoplay/.test(page.body) && /muted/.test(page.body), `${route} will autoplay`);
}
const css = readFileSync('src/app/globals.css', 'utf8');
check(
  /prefers-reduced-motion[\s\S]*auth-aside-video[\s\S]*display:\s*none/.test(css),
  'reduced motion gets the still frame instead of the loop',
);

// The clip is light and the panel text is near-white, so the scrim is what
// makes the copy readable rather than a decorative choice.
const aside = readFileSync('src/app/(auth)/AuthAside.tsx', 'utf8');
check(/color-mix\(in srgb, var\(--surface-chrome\)/.test(aside), 'a token-based scrim carries the contrast');

console.log('\nCLEANUP');
if (cleanup.mediaIds.length) await svc.from('media_files').delete().in('id', cleanup.mediaIds);
if (cleanup.paths.length) await svc.storage.from('case-media').remove(cleanup.paths);
for (const itemId of cleanup.responseItemIds) {
  await svc.from('case_checklist_responses').delete().eq('case_id', kase.id).eq('item_id', itemId);
}
const { count: mediaLeft } = await svc
  .from('media_files')
  .select('id', { count: 'exact', head: true })
  .like('file_name', 'fixprobe-%');
check(mediaLeft === 0, 'probe media removed', String(mediaLeft));

console.log(
  '\n' +
    (fail === 0
      ? `FIXES: all checks passed${skip ? ` (${skip} needs a look in a browser)` : ''}`
      : `FIXES: ${fail} FAILED`),
);
process.exit(fail ? 1 : 0);
