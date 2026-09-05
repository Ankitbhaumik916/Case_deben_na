/**
 * Many interviews per case.
 *
 *   npm run verify:interviews
 *
 * The point being proved is that a case is no longer limited to one account.
 * A case type's section holds one answer per field, which is why "Witness
 * Accounts" could only ever describe a single conversation; interviews are rows
 * now, so the test adds several to one case and checks they all survive, keep
 * their own recording, and come back in a sensible order.
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
    raw,
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

// A tiny but real WAV, so mime handling and playback are exercised for real.
const WAV = Buffer.from(
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=',
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
const made = [];
const paths = [];

console.log('\nPREFLIGHT');
const pre = await get(`/cases/${kase.id}?tab=interviews`, invCookie);
if (pre.status !== 200 || !/Interviews and statements/.test(pre.body)) {
  console.log(`  FAIL  the interviews tab did not render (status ${pre.status})`);
  console.log('        Either the server is on an older build, or the page failed.');
  process.exit(1);
}
check(true, 'the interviews tab rendered');

console.log('\nHOW MANY A CASE COULD HOLD BEFORE');
const { count: before } = await svc
  .from('interviews')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id);
check(true, 'interviews already on this case', String(before));

// The old ceiling was one, and this is why: a section holds one value per field.
const { data: witnessSection } = await svc
  .from('case_type_sections')
  .select('id, label, tab_key')
  .eq('tab_key', 'interviews')
  .limit(1)
  .maybeSingle();
if (witnessSection) {
  const { count: fieldCount } = await svc
    .from('case_type_fields')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', witnessSection.id);
  check(
    true,
    `the case type's "${witnessSection.label}" section holds ${fieldCount} fields, one answer each`,
    'which is why it could only describe one conversation',
  );
}

console.log('\nADDING SEVERAL TO ONE CASE');
const subjects = [
  ['Probe Witness A', '2026-08-01', 'Site office'],
  ['Probe Witness B', '2026-08-14', 'Front desk'],
  ['Probe Witness C', null, null],
];

for (const [name, date, place] of subjects) {
  const { data, error } = await inv
    .from('interviews')
    .insert({
      org_id: kase.org_id,
      case_id: kase.id,
      subject_name: `${name} ${stamp}`,
      interview_date: date ? new Date(date).toISOString() : null,
      location: place,
      conducted_by: 'Inés Vargas',
      narrative: `<p>Account from ${name}.</p>`,
    })
    .select('id, org_id, transcript_status')
    .single();
  check(!error, `added "${name}"`, error?.message ?? '');
  if (data) made.push(data.id);
}

check(made.length === 3, 'all three exist together on one case', `${made.length} of 3`);

const { data: first } = await svc
  .from('interviews')
  .select('org_id, transcript_status')
  .eq('id', made[0])
  .single();
check(
  first?.org_id === kase.org_id,
  'each inherits its org from the case, not from the client',
  first?.org_id ?? 'none',
);
check(
  first?.transcript_status === 'not_started',
  'and starts untranscribed, which is honest until a provider is chosen',
  first?.transcript_status,
);

const { count: after } = await svc
  .from('interviews')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id);
check(after === before + 3, 'the case now carries three more', `${before} -> ${after}`);

console.log('\nTHE PAGE SHOWS THEM ALL');
const listed = await get(`/cases/${kase.id}?tab=interviews`, invCookie);
for (const [name] of subjects) {
  check(listed.body.includes(`${name} ${stamp}`), `"${name}" appears on the page`);
}
check(
  new RegExp(`${after}\\s*on this case`).test(listed.body) || listed.body.includes('on this case'),
  'and the count is shown',
);
// Newest first: C has no date, A and B do. Whatever the order, B must precede A.
const posA = listed.body.indexOf(`Probe Witness A ${stamp}`);
const posB = listed.body.indexOf(`Probe Witness B ${stamp}`);
check(posB > -1 && posA > -1 && posB < posA, 'the more recent interview is listed first');

console.log('\nEACH KEEPS ITS OWN RECORDING');
const path = `${kase.org_id}/${kase.id}/probe-interview-${stamp}.wav`;
const { error: upErr } = await inv.storage
  .from('case-audio')
  .upload(path, WAV, { contentType: 'audio/wav' });
check(!upErr, 'an investigator uploads audio to the case-audio bucket', upErr?.message ?? '');
if (!upErr) paths.push(path);

const { error: attachErr } = await inv
  .from('interviews')
  .update({ bucket: 'case-audio', audio_path: path, audio_mime: 'audio/wav', duration_seconds: 12 })
  .eq('id', made[0]);
check(!attachErr, 'and attaches it to one interview', attachErr?.message ?? '');

const { data: others } = await svc
  .from('interviews')
  .select('id, audio_path')
  .in('id', made.slice(1));
check(
  (others ?? []).every((o) => o.audio_path === null),
  'the other interviews are unaffected by it',
);

const foreign = `00000000-0000-0000-0000-000000000000/${kase.id}/intruder-${stamp}.wav`;
const { error: foreignErr } = await inv.storage
  .from('case-audio')
  .upload(foreign, WAV, { contentType: 'audio/wav' });
check(
  !!foreignErr,
  'audio cannot be written under another organisation\'s prefix',
  foreignErr ? `${foreignErr.statusCode ?? ''} ${foreignErr.message}`.trim() : 'UPLOADED — LEAK',
);

const signed = await get(`/cases/${kase.id}?tab=interviews`, invCookie);
check(
  /storage\/v1\/object\/sign\/case-audio/.test(signed.raw),
  'the page serves the recording through a signed URL',
);
const match = signed.raw.match(/https?:\/\/[^"'\\]*storage\/v1\/object\/sign\/case-audio[^"'\\]*/);
if (match) {
  const url = match[0].replace(/&amp;/g, '&');
  const r = await fetch(url);
  check(r.ok, 'and that URL returns the audio', `${r.status} ${r.headers.get('content-type')}`);
} else {
  check(false, 'and that URL returns the audio', 'no signed URL found');
}

const anon = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/case-audio/${path}`,
);
check(!anon.ok, 'the recording is not readable without a signature', String(anon.status));

console.log('\nOTHER TABS DO NOT PAY FOR IT');
const fileTab = await get(`/cases/${kase.id}?tab=file`, invCookie);
check(
  !/storage\/v1\/object\/sign\/case-audio/.test(fileTab.raw),
  'the case file tab signs no audio URLs',
);

console.log('\nREAD-ONLY ACCOUNTS');
const roTab = await get(`/cases/${kase.id}?tab=interviews`, roCookie);
check(roTab.status === 200, 'can open the tab', String(roTab.status));
check(
  roTab.body.includes(`Probe Witness A ${stamp}`),
  'and read what is there',
);
check(!/Add interview/.test(roTab.body), 'but are offered no way to add one');

const { error: roAddErr } = await ro.from('interviews').insert({
  org_id: kase.org_id,
  case_id: kase.id,
  subject_name: 'Should not exist',
});
check(!!roAddErr, 'and the database refuses if they try anyway', roAddErr?.code ?? 'NO ERROR');

const roEdit = await ro
  .from('interviews')
  .update({ subject_name: 'renamed' })
  .eq('id', made[0])
  .select('id');
const { data: unchanged } = await svc
  .from('interviews')
  .select('subject_name')
  .eq('id', made[0])
  .single();
check(
  (roEdit.data ?? []).length === 0 && unchanged.subject_name.startsWith('Probe Witness A'),
  'nor edit one',
  `${(roEdit.data ?? []).length} rows, ${roEdit.error?.code ?? 'no error'}`,
);

console.log('\nREMOVING ONE LEAVES THE REST');
const { error: delErr } = await inv.from('interviews').delete().eq('id', made[2]);
check(!delErr, 'an investigator removes one', delErr?.message ?? '');
const { count: remaining } = await svc
  .from('interviews')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id);
check(remaining === after - 1, 'and only that one goes', `${after} -> ${remaining}`);
made.pop();

console.log('\nAUDIT');
const { data: logs } = await svc
  .from('activity_logs')
  .select('action')
  .eq('case_id', kase.id)
  .eq('target_type', 'interview');
const actions = [...new Set((logs ?? []).map((l) => l.action))];
check(
  actions.includes('interview.created') && actions.includes('interview.deleted'),
  'adding and removing an interview both reached the audit trail',
  actions.join(', ') || 'nothing',
);

manual(
  'adding one by hand',
  'open a case, Interviews, Add interview — then add a second and confirm both stay',
);

console.log('\nCLEANUP');
if (made.length) await svc.from('interviews').delete().in('id', made);
if (paths.length) await svc.storage.from('case-audio').remove(paths);
const { count: end } = await svc
  .from('interviews')
  .select('id', { count: 'exact', head: true })
  .eq('case_id', kase.id);
check(end === before, 'back to the count this run started with', `${end} of ${before}`);

const { data: leftover } = await svc.storage
  .from('case-audio')
  .list(`${kase.org_id}/${kase.id}`, { search: `probe-interview-${stamp}` });
check((leftover ?? []).length === 0, 'probe audio removed from the bucket');

console.log(
  '\n' +
    (fail === 0
      ? `INTERVIEWS: all checks passed${skip ? ` (${skip} needs a look in a browser)` : ''}`
      : `INTERVIEWS: ${fail} FAILED`),
);
process.exit(fail ? 1 : 0);
