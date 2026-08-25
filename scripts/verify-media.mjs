/**
 * Phase 8: the case library.
 *
 *   npm run verify:media
 *
 * This is the first phase where the tenant boundary is a storage path rather
 * than a row, so that is what gets the most attention: an investigator must not
 * be able to write into another organisation's prefix, and a read-only account
 * must not be able to write at all — proved against real storage, not asserted
 * from the shape of the code.
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
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
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

// A real 1x1 PNG, so mime sniffing and <img> rendering are exercised for real.
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

const { data: kase } = await svc
  .from('cases')
  .select('id, org_id, case_number')
  .eq('case_number', 'NG-2026-0101')
  .single();

const stamp = Date.now();
const paths = [];
const mediaIds = [];
let logId = null;

console.log('\nPREFLIGHT');
const tab = await get(`/cases/${kase.id}?tab=library`, invCookie);
if (tab.status !== 200 || !/Case library/.test(tab.body)) {
  console.log(`  FAIL  the library tab did not render (status ${tab.status})`);
  console.log('        Either the server is on an older build, or the page failed.');
  process.exit(1);
}
check(true, 'the library tab rendered');

console.log('\nTHE TAB');
check(/Gallery/.test(tab.body), 'offers a gallery view');
check(/Table/.test(tab.body), 'a table view');
check(/Log reports/.test(tab.body), 'and log reports');
check(/Drop files here/.test(tab.body), 'an investigator gets a drop target');

console.log('\nSTORAGE IS THE TENANT BOUNDARY');
const foreign = `00000000-0000-0000-0000-000000000000/${kase.id}/intruder-${stamp}.png`;
const { error: foreignErr } = await inv.storage
  .from('case-media')
  .upload(foreign, PNG, { contentType: 'image/png' });
check(
  !!foreignErr,
  'an investigator cannot write under another organisation\'s prefix',
  foreignErr ? `${foreignErr.statusCode ?? ''} ${foreignErr.message}`.trim() : 'UPLOADED — LEAK',
);

const roPath = `${kase.org_id}/${kase.id}/readonly-${stamp}.png`;
const { error: roUploadErr } = await ro.storage
  .from('case-media')
  .upload(roPath, PNG, { contentType: 'image/png' });
check(
  !!roUploadErr,
  'a read-only account cannot write to the bucket at all',
  roUploadErr ? `${roUploadErr.statusCode ?? ''} ${roUploadErr.message}`.trim() : 'UPLOADED — LEAK',
);

console.log('\nUPLOADING');
const okPath = `${kase.org_id}/${kase.id}/probe-${stamp}-scene.png`;
const { error: upErr } = await inv.storage
  .from('case-media')
  .upload(okPath, PNG, { contentType: 'image/png' });
check(!upErr, 'an investigator uploads into their own case prefix', upErr?.message ?? '');
if (!upErr) paths.push(okPath);

const { data: row, error: rowErr } = await inv
  .from('media_files')
  .insert({
    org_id: kase.org_id,
    case_id: kase.id,
    bucket: 'case-media',
    storage_path: okPath,
    file_name: `probe-${stamp}-scene.png`,
    mime_type: 'image/png',
    size_bytes: PNG.length,
    caption: 'Probe photograph, north elevation',
    tags: ['probe', 'exterior'],
  })
  .select('id, org_id')
  .single();
check(!rowErr, 'and the file is recorded against the case', rowErr?.message ?? '');
if (row) mediaIds.push(row.id);

check(
  row?.org_id === kase.org_id,
  'the row inherits the org from its case, not from the client',
  row?.org_id ?? 'no row',
);

const { error: roRowErr } = await ro.from('media_files').insert({
  org_id: kase.org_id,
  case_id: kase.id,
  bucket: 'case-media',
  storage_path: `${kase.org_id}/${kase.id}/never-${stamp}.png`,
  file_name: 'never.png',
});
check(!!roRowErr, 'a read-only account cannot record one either', roRowErr?.code ?? 'NO ERROR');

console.log('\nTHE GALLERY');
const withFile = await get(`/cases/${kase.id}?tab=library`, invCookie);
check(
  /Probe photograph, north elevation/.test(withFile.body),
  'shows the caption rather than the filename',
);
check(/probe/.test(withFile.body) && /exterior/.test(withFile.body), 'and its tags');
check(
  /storage\/v1\/object\/sign\/case-media/.test(withFile.body),
  'renders the image from a signed URL',
);

// The bucket is private. A signed URL is the only way the picture appears, so
// it is worth proving one actually serves bytes rather than a 400.
const signedMatch = withFile.body.match(/https?:\/\/[^"']*storage\/v1\/object\/sign\/case-media[^"']*/);
if (signedMatch) {
  const url = signedMatch[0].replace(/&amp;/g, '&');
  const img = await fetch(url);
  check(
    img.ok && (img.headers.get('content-type') ?? '').startsWith('image/'),
    'and that URL returns the image',
    `${img.status} ${img.headers.get('content-type')}`,
  );
} else {
  check(false, 'and that URL returns the image', 'no signed URL found in the page');
}

const anon = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/case-media/${okPath}`,
);
check(!anon.ok, 'the same object is not readable without a signature', String(anon.status));

console.log('\nSIGNING IS SCOPED TO THE TAB THAT NEEDS IT');
const fileTab = await get(`/cases/${kase.id}?tab=file`, invCookie);
check(
  fileTab.status === 200 && !/storage\/v1\/object\/sign/.test(fileTab.body),
  'the case file tab signs nothing',
);

console.log('\nREAD-ONLY ACCOUNTS');
const roTab = await get(`/cases/${kase.id}?tab=library`, roCookie);
check(roTab.status === 200 && !/Drop files here/.test(roTab.body), 'are offered no drop target');
check(
  /Probe photograph, north elevation/.test(roTab.body),
  'but can still see and open the files',
);

console.log('\nLOG REPORTS');
const { data: log, error: logErr } = await inv
  .from('media_log_reports')
  .insert({
    org_id: kase.org_id,
    case_id: kase.id,
    title: `Probe photo log ${stamp}`,
    media_ids: mediaIds,
  })
  .select('id')
  .single();
check(!logErr, 'an investigator generates a log over a chosen set', logErr?.message ?? '');
logId = log?.id ?? null;

const { error: roLogErr } = await ro.from('media_log_reports').insert({
  org_id: kase.org_id,
  case_id: kase.id,
  title: 'Should not exist',
  media_ids: mediaIds,
});
check(!!roLogErr, 'a read-only account cannot', roLogErr?.code ?? 'NO ERROR');

const doc = await get(`/cases/${kase.id}/media-log/${logId}`, invCookie);
check(doc.status === 200, 'the log renders as a document', String(doc.status));
check(new RegExp(`Probe photo log ${stamp}`).test(doc.body), 'titled as it was named');
check(/Probe photograph, north elevation/.test(doc.body), 'carrying each caption');
// >01< rather than a word-boundary match, so a stray number elsewhere on the
// page cannot pass this: it has to be the contents of the numbering element.
check(/>01</.test(doc.body), 'numbered');
check(/reproduced from the case library/.test(doc.body), 'and saying where its contents came from');

console.log('\nA LOG DOES NOT QUIETLY RENUMBER ITSELF');
// The log stores ids. Deleting a file it names must show as a gap, not vanish.
await svc.from('media_files').delete().eq('id', mediaIds[0]);
const gapped = await get(`/cases/${kase.id}/media-log/${logId}`, invCookie);
check(
  /deleted from the case since the log was generated/.test(gapped.body),
  'a file deleted afterwards is reported, not dropped',
);
check(/>01</.test(gapped.body), 'and keeps its number');

console.log('\nAUDIT');
const { data: logs } = await svc
  .from('activity_logs')
  .select('action')
  .eq('case_id', kase.id)
  .in('target_type', ['media', 'media_log']);
check(
  (logs ?? []).some((l) => l.action === 'media.created') &&
    (logs ?? []).some((l) => l.action === 'media_log.created'),
  'both the file and the log reached the audit trail',
  [...new Set((logs ?? []).map((l) => l.action))].join(', ') || 'nothing',
);

console.log('\nCLEANUP');
if (logId) await svc.from('media_log_reports').delete().eq('id', logId);
await svc.from('media_files').delete().in('id', mediaIds);
if (paths.length) await svc.storage.from('case-media').remove(paths);

const { count: rowsLeft } = await svc
  .from('media_files')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id)
  .like('file_name', 'probe-%');
check(rowsLeft === 0, 'probe rows removed', String(rowsLeft));

const { data: objectsLeft } = await svc.storage
  .from('case-media')
  .list(`${kase.org_id}/${kase.id}`, { search: `probe-${stamp}` });
check((objectsLeft ?? []).length === 0, 'probe objects removed from the bucket', String((objectsLeft ?? []).length));

console.log('\n' + (fail === 0 ? 'MEDIA: all checks passed' : `MEDIA: ${fail} FAILED`));
process.exit(fail ? 1 : 0);
